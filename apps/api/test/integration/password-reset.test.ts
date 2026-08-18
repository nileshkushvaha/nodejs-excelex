import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaService } from "../../src/core/database/prisma.service";
import { RateLimiterService } from "../../src/core/rate-limit/rate-limiter.service";
import { HOSTS, TEST_ADMIN, ensureTestAdmin, startApi } from "./harness";

/**
 * The forgotten-password flow, end to end.
 *
 * The code is read back from the mailbox — Mailpit's API in development, the
 * database's hash never — so the test exercises what a person does. In CI
 * (SMTP_URL=json) the mailed step cannot be read, so the code is taken from
 * the outbox job's payload instead; the same three HTTP calls are made.
 */
const MAILPIT = process.env["MAILPIT_URL"] ?? "http://localhost:8025";
const RESET_EMAIL = "reset-target@excelex.in";
const RESET_PASSWORD = "Reset-Me!2026-start";
const NEW_PASSWORD = "Reset-Me!2026-after";

describe("password reset by mailed code", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;

  const post = (path: string, body: object) =>
    request(app.getHttpServer()).post(`/api/v1/auth/${path}`).set("host", HOSTS.a).send(body);

  beforeAll(async () => {
    app = await startApi();
    await ensureTestAdmin(app);
    prisma = app.get(PrismaService);
    const limiter = app.get(RateLimiterService);
    await limiter.reset(`reset:request:email:${TEST_ADMIN.clientId}:${RESET_EMAIL}`);
    for (const ip of ["::1", "127.0.0.1", "::ffff:127.0.0.1"]) {
      await limiter.reset(`reset:request:ip:${ip}`);
      await limiter.reset(`reset:verify:ip:${ip}`);
    }

    // A dedicated, locked-out user with an old session, so the reset has
    // something to clear and something to revoke.
    const { hashPassword } = await import("@excelex/database");
    const passwordHash = await hashPassword(RESET_PASSWORD);
    userId = await prisma.forClient(TEST_ADMIN.clientId, async (tx) => {
      const existing = await tx.user.findFirst({ where: { email: RESET_EMAIL, deletedAt: null } });
      const user = existing
        ? await tx.user.update({ where: { id: existing.id }, data: { passwordHash, isActive: true, failedLoginAttempts: 5, lockedUntil: new Date(Date.now() + 3_600_000) } })
        : await tx.user.create({ data: { clientId: TEST_ADMIN.clientId, email: RESET_EMAIL, fullName: "Reset Target", passwordHash, failedLoginAttempts: 5, lockedUntil: new Date(Date.now() + 3_600_000) } });
      await tx.passwordReset.deleteMany({ where: { userId: user.id } });
      await tx.session.create({
        data: {
          clientId: TEST_ADMIN.clientId, userId: user.id, tokenHash: `test-${Date.now()}`, host: HOSTS.a,
          idleExpiresAt: new Date(Date.now() + 3_600_000), absoluteExpiry: new Date(Date.now() + 3_600_000),
        },
      });
      return user.id;
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("answers the same for a known and an unknown address", async () => {
    const known = await post("password-reset/request", { email: RESET_EMAIL });
    const unknown = await post("password-reset/request", { email: `nobody-${Date.now()}@excelex.in` });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
  });

  it("mails a code, exchanges it for a token, sets the password, clears the lock and ends sessions", async () => {
    // Wait for the queued mail to be sent, then read the code the way a person would.
    const code = await readCode();
    expect(code).toMatch(/^\d{6}$/);

    const wrong = await post("password-reset/verify", { email: RESET_EMAIL, code: code === "000000" ? "000001" : "000000" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe("reset_code_invalid");

    const verified = await post("password-reset/verify", { email: RESET_EMAIL, code });
    expect(verified.status, JSON.stringify(verified.body)).toBe(200);
    expect(typeof verified.body.resetToken).toBe("string");

    // A policy-refusing password is named on its field.
    const weak = await post("password-reset/complete", { email: RESET_EMAIL, resetToken: verified.body.resetToken, newPassword: "short" });
    expect(weak.status).toBe(400);
    expect(weak.body.errors?.[0]?.path).toBe("newPassword");

    const done = await post("password-reset/complete", { email: RESET_EMAIL, resetToken: verified.body.resetToken, newPassword: NEW_PASSWORD });
    expect(done.status, JSON.stringify(done.body)).toBe(200);

    // The token is single-use.
    const again = await post("password-reset/complete", { email: RESET_EMAIL, resetToken: verified.body.resetToken, newPassword: `${NEW_PASSWORD}x` });
    expect(again.status).toBe(400);

    const user = await prisma.forClient(TEST_ADMIN.clientId, async (tx) => tx.user.findFirstOrThrow({ where: { id: userId }, include: { sessions: true } }));
    expect(user.lockedUntil).toBeNull();
    expect(user.failedLoginAttempts).toBe(0);
    expect(user.sessions.every((s) => s.revokedAt !== null)).toBe(true);

    // The new password signs in; the old one does not.
    const login = await post("login", { email: RESET_EMAIL, password: NEW_PASSWORD });
    expect(login.status, JSON.stringify(login.body)).toBe(200);
    const old = await post("login", { email: RESET_EMAIL, password: RESET_PASSWORD });
    expect(old.status).toBe(401);
  });

  it("throttles repeated requests for one address", async () => {
    let last = await post("password-reset/request", { email: RESET_EMAIL });
    for (let i = 0; i < 4 && last.status !== 429; i += 1) last = await post("password-reset/request", { email: RESET_EMAIL });
    expect(last.status).toBe(429);
    expect(last.body.code).toBe("rate_limited");
  });

  async function readCode(): Promise<string> {
    // The mail job runs in the same process; give it a moment.
    for (let i = 0; i < 60; i += 1) {
      const row = await prisma.forClient(TEST_ADMIN.clientId, async (tx) =>
        tx.mailMessage.findFirst({ where: { toEmail: RESET_EMAIL, template: "auth.password_reset" }, orderBy: { createdAt: "desc" } }),
      );
      if (row?.status === "SENT") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (process.env["SMTP_URL"] === "json") {
      // No mailbox to read: the job payload carries the rendered content.
      const job = await prisma.forClient(TEST_ADMIN.clientId, async (tx) =>
        tx.job.findFirst({ where: { name: "mail.send" }, orderBy: { createdAt: "desc" } }),
      );
      const content = (job?.payload as { content?: { paragraphs?: string[] } })?.content;
      return content?.paragraphs?.find((p) => /^\d{6}$/.test(p)) ?? "";
    }
    const response = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${RESET_EMAIL} subject:"password reset code"`)}&limit=1`);
    const data = (await response.json()) as { messages: Array<{ Subject: string }> };
    const subject = data.messages[0]?.Subject ?? "";
    return subject.match(/^(\d{6}) /)?.[1] ?? "";
  }
});
