// The API loads its environment in main.ts, which these tests do not run.
// Without this the module graph fails to construct and every test reports a
// missing app rather than a missing variable.
import "dotenv/config";

import { INestApplication, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hashPassword } from "@excelex/database";
import cookieParser from "cookie-parser";
import request from "supertest";

import { AppModule } from "../../src/app.module";
import { PrismaService } from "../../src/core/database/prisma.service";

/**
 * The application, against a real database.
 *
 * Real rather than mocked on purpose: the properties worth testing here are
 * the ones only Postgres can enforce — row-level security, the constraints
 * written by hand into migrations, and the fact that a client's request
 * cannot see another client's rows. A mocked Prisma would assert that the
 * code calls the functions the code calls.
 *
 * Everything is created through the API where an endpoint exists, so the
 * tests exercise the same path a browser does.
 */
export async function startApi(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });

  await app.init();
  return app;
}

/**
 * Both hosts the isolation proof seeds, so a test can act as either client.
 *
 * The host is how a client is resolved — there is no client id in a request
 * body anywhere — which is itself the property being tested: a caller cannot
 * ask for another client's data because there is no field in which to ask.
 */
export const HOSTS = {
  a: "localhost",
  b: "globex.localhost",
} as const;

/**
 * A test-owned administrator, so the suite never depends on the human's
 * seeded account.
 *
 * The seed account belongs to whoever is using the development stack: they
 * change its password, and a suite that hard-codes the old one then locks
 * them out (which happened). This account is created if missing and has its
 * password reset every time the suite boots, through the same client-scoped
 * path a request would use, so nothing here bypasses isolation.
 */
export const TEST_ADMIN = {
  clientId: "11111111-1111-4111-8111-111111111111",
  email: "qa-admin@excelex.in",
  password: "Qa-Admin!2026-integration",
} as const;

export async function ensureTestAdmin(app: INestApplication): Promise<{ id: string }> {
  const prisma = app.get(PrismaService);
  const passwordHash = await hashPassword(TEST_ADMIN.password);

  return prisma.forClient(TEST_ADMIN.clientId, async (tx) => {
    const role = await tx.role.findFirst({ where: { name: "Administrator", isSystem: true } });
    if (!role) throw new Error("The seed has not run: no Administrator role in the test client.");

    const existing = await tx.user.findFirst({ where: { email: TEST_ADMIN.email, deletedAt: null } });
    const user = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: { passwordHash, isActive: true, lockedUntil: null, failedLoginAttempts: 0 },
        })
      : await tx.user.create({
          data: {
            clientId: TEST_ADMIN.clientId,
            email: TEST_ADMIN.email,
            fullName: "QA Administrator",
            passwordHash,
          },
        });

    const assigned = await tx.userRole.findFirst({
      where: { userId: user.id, roleId: role.id, branchId: null },
    });
    if (!assigned) {
      await tx.userRole.create({ data: { clientId: TEST_ADMIN.clientId, userId: user.id, roleId: role.id } });
    }
    return { id: user.id };
  });
}

/** Signs the test administrator in over HTTP and returns the cookie header value. */
export async function signInTestAdmin(app: INestApplication): Promise<string> {
  await ensureTestAdmin(app);
  const response = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .set("host", HOSTS.a)
    .send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password });
  if (response.status !== 200) {
    throw new Error(`Test admin sign-in failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return (response.headers["set-cookie"] as unknown as string[]).map((c) => c.split(";")[0]).join("; ");
}
