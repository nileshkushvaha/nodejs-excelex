import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaService } from "../../src/core/database/prisma.service";
import { HOSTS, TEST_ADMIN, ensureTestAdmin, startApi } from "./harness";

/**
 * Login history, end to end: every branch of sign-in leaves a row that says
 * what really happened, while the wire says the same thing for all of them.
 *
 * Through HTTP, because the property being tested is that AuthService writes
 * history on the real path — the one with the real transactions — and that
 * the response an attacker sees does not change because a row was written.
 */
const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";

const ADMIN_EMAIL = TEST_ADMIN.email;
const ADMIN_PASSWORD = TEST_ADMIN.password;

describe("login history", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let startedAt: Date;
  let cookie: string;
  const unknownEmail = `nobody-${randomUUID()}@example.com`;

  beforeAll(async () => {
    app = await startApi();
    await ensureTestAdmin(app);
    prisma = app.get(PrismaService);
    startedAt = new Date();

    // A previous run may have left the counter one short of the lock; this
    // test must not be the one that trips it.
    await prisma.forClient(CLIENT_A, async (tx) => {
      await tx.user.updateMany({
        where: { email: ADMIN_EMAIL },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    });
  });

  afterAll(async () => {
    // login_attempts allows DELETE to the runtime role; the audit trail does
    // not, and this test does not try.
    await prisma.forClient(CLIENT_A, async (tx) => {
      await tx.loginAttempt.deleteMany({
        where: { createdAt: { gte: startedAt }, email: { in: [ADMIN_EMAIL, unknownEmail] } },
      });
    });
    await app.close();
  });

  const login = (email: string, password: string) =>
    request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set("Host", HOSTS.a)
      .set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126.0 Safari/537.36")
      .send({ email, password });

  const rowsFor = (email: string) =>
    prisma.forClient(CLIENT_A, (tx) =>
      tx.loginAttempt.findMany({
        where: { email, createdAt: { gte: startedAt } },
        orderBy: { createdAt: "asc" },
      }),
    );

  it("records a wrong password as BAD_PASSWORD, with the caller's address", async () => {
    const response = await login(ADMIN_EMAIL, "definitely-not-the-password");
    expect(response.status).toBe(401);

    const rows = await rowsFor(ADMIN_EMAIL);
    const failed = rows.filter((row) => row.outcome === "BAD_PASSWORD");
    expect(failed.length).toBeGreaterThanOrEqual(1);
    expect(failed[0]!.userId).not.toBeNull();
    expect(failed[0]!.ip).toBeTruthy();
    expect(failed[0]!.host).toBe(HOSTS.a);
  });

  it("records an unknown address as UNKNOWN_USER and answers exactly as it does a wrong password", async () => {
    const [wrong, unknown] = await Promise.all([
      login(ADMIN_EMAIL, "still-not-the-password"),
      login(unknownEmail, "whatever"),
    ]);

    expect(unknown.status).toBe(wrong.status);
    expect(unknown.body.message).toEqual(wrong.body.message);

    const rows = await rowsFor(unknownEmail);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.outcome).toBe("UNKNOWN_USER");
    expect(rows[0]!.userId).toBeNull();
  });

  it("records a good sign-in as SUCCEEDED, pointing at the session it issued", async () => {
    const response = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    expect(response.status).toBe(200);
    cookie = (response.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;

    const rows = await rowsFor(ADMIN_EMAIL);
    const succeeded = rows.filter((row) => row.outcome === "SUCCEEDED");
    expect(succeeded.length).toBeGreaterThanOrEqual(1);

    const last = succeeded[succeeded.length - 1]!;
    expect(last.sessionId).toBeTruthy();

    const session = await prisma.forClient(CLIENT_A, (tx) =>
      tx.session.findFirst({ where: { id: last.sessionId! } }),
    );
    expect(session).not.toBeNull();
    expect(session!.userId).toBe(last.userId);
    expect(session!.revokedAt).toBeNull();
  });

  it("lists the history to an administrator, with the user and session joined", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/system/login-history?email=${encodeURIComponent(ADMIN_EMAIL)}&pageSize=50`)
      .set("Host", HOSTS.a)
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
    const rows = response.body.rows as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThanOrEqual(3);

    const succeeded = rows.find((row) => row["outcome"] === "SUCCEEDED");
    expect(succeeded).toBeDefined();
    expect(succeeded!["sessionActive"]).toBe(true);
    expect((succeeded!["user"] as { fullName: string }).fullName).toBeTruthy();
    expect((succeeded!["device"] as { browser: string }).browser).toBe("Chrome");
    expect((succeeded!["device"] as { os: string }).os).toBe("macOS");

    const unknown = await request(app.getHttpServer())
      .get(`/api/v1/system/login-history?outcome=UNKNOWN_USER&search=${encodeURIComponent(unknownEmail)}`)
      .set("Host", HOSTS.a)
      .set("Cookie", cookie);
    expect(unknown.status).toBe(200);
    expect(unknown.body.rows).toHaveLength(1);
    expect(unknown.body.rows[0].user).toBeNull();
  });

  it("answers the summary and the per-user view", async () => {
    const summary = await request(app.getHttpServer())
      .get("/api/v1/system/login-history/summary?days=7")
      .set("Host", HOSTS.a)
      .set("Cookie", cookie);
    expect(summary.status).toBe(200);
    expect(summary.body.totals.attempts).toBeGreaterThanOrEqual(3);
    expect(summary.body.byDay).toHaveLength(7);
    expect(summary.body.activeSessions).toBeGreaterThanOrEqual(1);

    const rows = await rowsFor(ADMIN_EMAIL);
    const userId = rows.find((row) => row.userId)!.userId!;
    const perUser = await request(app.getHttpServer())
      .get(`/api/v1/system/login-history/users/${userId}`)
      .set("Host", HOSTS.a)
      .set("Cookie", cookie);
    expect(perUser.status).toBe(200);
    expect(perUser.body.user.id).toBe(userId);
    expect(perUser.body.activeSessions.length).toBeGreaterThanOrEqual(1);
  });

  it("exports CSV with a header row", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/system/login-history/export?email=${encodeURIComponent(ADMIN_EMAIL)}`)
      .set("Host", HOSTS.a)
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain("login-history-");
    const lines = response.text.trim().split("\n");
    expect(lines[0]).toBe("When,Email,User,Outcome,IP,Browser,OS,User agent,Host,Session id");
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps one client's attempts invisible to another", async () => {
    const seenByB = await prisma.forClient(CLIENT_B, (tx) =>
      tx.loginAttempt.findMany({ where: { email: { in: [ADMIN_EMAIL, unknownEmail] } } }),
    );
    expect(seenByB).toHaveLength(0);
  });
});
