import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HOSTS, TEST_ADMIN, signInTestAdmin, startApi } from "./harness";

/**
 * Logged-in users: an administrator sees live sessions and can end one —
 * and the ended one is refused on its very next request, not ten seconds
 * later, because the cached actor is dropped with it.
 */
describe("logged-in users", () => {
  let app: INestApplication;
  let cookie: string;

  beforeAll(async () => {
    app = await startApi();
    cookie = await signInTestAdmin(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it("lists live sessions with the person, device and activity, and revokes one immediately", async () => {
    // A second session for the same account, to be revoked from the first.
    const second = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set("host", HOSTS.a)
      .set("user-agent", "Mozilla/5.0 (Windows NT 10.0) Chrome/126.0")
      .send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password });
    expect(second.status).toBe(200);
    const secondCookie = (second.headers["set-cookie"] as unknown as string[]).map((c) => c.split(";")[0]).join("; ");

    const list = await request(app.getHttpServer()).get("/api/v1/system/sessions?search=qa-admin").set("host", HOSTS.a).set("cookie", cookie);
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    expect(list.body.total).toBeGreaterThanOrEqual(2);
    const row = list.body.rows.find((r: { device?: { browser?: string } }) => r.device?.browser === "Chrome");
    expect(row, JSON.stringify(list.body.rows)).toBeDefined();
    expect(row.user.email).toBe(TEST_ADMIN.email);
    expect(row.isSelf).toBe(true);
    expect(typeof row.lastActiveAt).toBe("string");

    const summary = await request(app.getHttpServer()).get("/api/v1/system/sessions/summary").set("host", HOSTS.a).set("cookie", cookie);
    expect(summary.body.activeSessions).toBeGreaterThanOrEqual(2);

    // The second session works, is revoked, and is refused on its next request.
    expect((await request(app.getHttpServer()).get("/api/v1/auth/me").set("host", HOSTS.a).set("cookie", secondCookie)).status).toBe(200);
    const revoke = await request(app.getHttpServer()).post(`/api/v1/system/sessions/${row.id}/revoke`).set("host", HOSTS.a).set("cookie", cookie);
    expect(revoke.status).toBe(200);
    expect(revoke.body.revoked).toBe(1);
    expect((await request(app.getHttpServer()).get("/api/v1/auth/me").set("host", HOSTS.a).set("cookie", secondCookie)).status).toBe(401);
    // The first is untouched.
    expect((await request(app.getHttpServer()).get("/api/v1/auth/me").set("host", HOSTS.a).set("cookie", cookie)).status).toBe(200);
  });
});
