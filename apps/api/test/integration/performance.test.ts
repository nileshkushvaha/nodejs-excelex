import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HOSTS, signInTestAdmin, startApi } from "./harness";

/**
 * The performance screen's data, through HTTP: the middleware must see every
 * request (including a 404), file it under the route pattern rather than the
 * URL, and the Prisma timing hook must have seen the queries a sign-in makes.
 */
describe("application performance", () => {
  let app: INestApplication;
  let cookie: string;

  beforeAll(async () => {
    app = await startApi();

    cookie = await signInTestAdmin(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it("counts requests under their route pattern, including a 404", async () => {
    await request(app.getHttpServer()).get("/api/v1/healthz").set("Host", HOSTS.a).expect(200);
    await request(app.getHttpServer()).get("/api/v1/healthz").set("Host", HOSTS.a).expect(200);
    await request(app.getHttpServer()).get("/api/v1/no/such/route").set("Host", HOSTS.a).expect(404);

    const response = await request(app.getHttpServer())
      .get("/api/v1/system/performance?window=15")
      .set("Host", HOSTS.a)
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
    const body = response.body;
    expect(body.instance).toContain("#");
    expect(body.http.requests).toBeGreaterThan(0);
    expect(body.http.windowMinutes).toBe(15);
    expect(body.http.perMinute).toHaveLength(15);

    const routes = await request(app.getHttpServer())
      .get("/api/v1/system/performance/routes?window=15&sort=count")
      .set("Host", HOSTS.a)
      .set("Cookie", cookie)
      .expect(200);
    const labels = routes.body.routes.map((r: { route: string }) => r.route);
    expect(labels).toContain("/api/v1/healthz");
    expect(labels).toContain("unmatched");
    expect(labels.some((label: string) => label.includes("no/such"))).toBe(false);

    // Sign-in and the guard both query Postgres, so the timing hook has fired.
    expect(body.db.perModel.length).toBeGreaterThan(0);
    expect(body.db.queries).toBeGreaterThan(0);
    expect(body.database.ok).toBe(true);
    expect(body.redis.ok).toBe(true);
    expect(Array.isArray(body.queues)).toBe(true);
    expect(body.eventLoop).toHaveProperty("p99");
    expect(body.memory.rss).toBeGreaterThan(0);
  });

  it("rejects a window it does not keep", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/system/performance?window=7")
      .set("Host", HOSTS.a)
      .set("Cookie", cookie)
      .expect(400);
  });

  it("reports health checks and whether /metrics is protected", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/system/performance/health")
      .set("Host", HOSTS.a)
      .set("Cookie", cookie)
      .expect(200);
    const names = response.body.checks.map((c: { name: string }) => c.name);
    expect(names).toEqual(["database", "redis", "workers", "scheduler"]);
    expect(response.body.metricsPath).toBe("/api/metrics");
    expect(typeof response.body.metricsProtected).toBe("boolean");
  });

  it("requires the permission", async () => {
    await request(app.getHttpServer()).get("/api/v1/system/performance").set("Host", HOSTS.a).expect(401);
  });

  it("serves the Prometheus exposition without a session in a non-production environment", async () => {
    const response = await request(app.getHttpServer()).get("/api/metrics").set("Host", HOSTS.a);
    if (process.env["METRICS_TOKEN"]) {
      expect(response.status).toBe(403);
      const withToken = await request(app.getHttpServer())
        .get("/api/metrics")
        .set("Host", HOSTS.a)
        .set("Authorization", `Bearer ${process.env["METRICS_TOKEN"]}`);
      expect(withToken.status).toBe(200);
      expect(withToken.text).toContain("excelex_http_requests_total");
      return;
    }
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.text).toContain("excelex_http_requests_total");
    expect(response.text).toContain("excelex_http_request_duration_seconds");
    expect(response.text).toContain("excelex_db_query_duration_seconds");
    expect(response.text).toContain('route="/api/v1/healthz"');
  });
});
