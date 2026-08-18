import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CacheService } from "../../src/core/cache/cache.service";
import { PrismaService } from "../../src/core/database/prisma.service";
import { RateLimiterService } from "../../src/core/rate-limit/rate-limiter.service";
import { HOSTS, TEST_ADMIN, ensureTestAdmin, startApi } from "./harness";

/**
 * Rate limiting, against real Redis.
 *
 * The limiter's arithmetic, its atomicity under concurrency, the headers the
 * guard writes, and the sign-in throttle end to end — including that a
 * client can switch the per-email half off and that a refused attempt is
 * written to login history as THROTTLED.
 */
describe("rate limiting", () => {
  let app: INestApplication;
  let limiter: RateLimiterService;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await startApi();
    await ensureTestAdmin(app);
    limiter = app.get(RateLimiterService);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it("allows up to the limit and then refuses until the window resets", async () => {
    const bucket = `test:${Date.now()}`;
    const verdicts = [];
    for (let i = 0; i < 4; i += 1) verdicts.push(await limiter.consume(bucket, 3, 60));

    expect(verdicts.map((v) => v.allowed)).toEqual([true, true, true, false]);
    expect(verdicts.map((v) => v.remaining)).toEqual([2, 1, 0, 0]);
    expect(verdicts[3]!.resetSeconds).toBeGreaterThan(0);
    expect(verdicts[3]!.resetSeconds).toBeLessThanOrEqual(60);
    await limiter.reset(bucket);
  });

  it("counts concurrent hits exactly once each", async () => {
    // Twenty in flight at once: the Lua script makes INCR + PEXPIRE one
    // step, so exactly `limit` are allowed and none double-count.
    const bucket = `test:concurrent:${Date.now()}`;
    const verdicts = await Promise.all(Array.from({ length: 20 }, () => limiter.consume(bucket, 5, 60)));
    expect(verdicts.filter((v) => v.allowed)).toHaveLength(5);
    expect(await limiter.peek(bucket)).toBe(20);
    await limiter.reset(bucket);
  });

  it("writes the RateLimit headers on an ordinary response", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/healthz").set("host", HOSTS.a);
    expect(response.status).toBe(200);
    expect(response.headers["ratelimit-limit"]).toBeDefined();
    expect(response.headers["ratelimit-remaining"]).toBeDefined();
    expect(response.headers["ratelimit-reset"]).toBeDefined();
  });

  it("throttles repeated sign-ins against one email and records them", async () => {
    const email = `spray-${Date.now()}@example.test`;
    const attempt = () =>
      request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .set("host", HOSTS.a)
        .send({ email, password: "wrong" });

    let last = await attempt();
    for (let i = 0; i < 10 && last.status !== 429; i += 1) last = await attempt();

    expect(last.status).toBe(429);
    expect(last.body.code).toBe("rate_limited");
    expect(last.headers["retry-after"]).toMatch(/^\d+$/);
    // The refusal says nothing about whether the address exists.
    expect(String(last.body.message)).not.toMatch(/exist|unknown|password/i);

    const rows = await prisma.forClient(TEST_ADMIN.clientId, async (tx) =>
      tx.loginAttempt.findMany({ where: { email }, select: { outcome: true } }),
    );
    expect(rows.some((row) => row.outcome === "THROTTLED")).toBe(true);
    expect(rows.filter((row) => row.outcome === "UNKNOWN_USER")).toHaveLength(10);

    await prisma.forClient(TEST_ADMIN.clientId, async (tx) => tx.loginAttempt.deleteMany({ where: { email } }));
    await limiter.reset(`login:email:${TEST_ADMIN.clientId}:${email}`);
  });

  it("lets a client switch the per-email throttle off", async () => {
    const cache = app.get(CacheService);
    const email = `unthrottled-${Date.now()}@example.test`;
    // Flip the client's setting directly and drop the cached copy, as the
    // settings screen's update path does.
    await prisma.forClient(TEST_ADMIN.clientId, async (tx) => {
      await tx.securitySettings.updateMany({ data: { loginThrottleEnabled: false } });
    });
    await cache.del({ clientId: TEST_ADMIN.clientId }, "settings", "security");

    try {
      let last: request.Response | undefined;
      for (let i = 0; i < 12; i += 1) {
        last = await request(app.getHttpServer())
          .post("/api/v1/auth/login")
          .set("host", HOSTS.a)
          .send({ email, password: "wrong" });
      }
      expect(last!.status).toBe(401);
    } finally {
      await prisma.forClient(TEST_ADMIN.clientId, async (tx) => {
        await tx.securitySettings.updateMany({ data: { loginThrottleEnabled: true } });
        await tx.loginAttempt.deleteMany({ where: { email } });
      });
      await cache.del({ clientId: TEST_ADMIN.clientId }, "settings", "security");
    }
  });
});
