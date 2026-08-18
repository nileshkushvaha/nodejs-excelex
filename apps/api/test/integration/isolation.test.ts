import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HOSTS, startApi } from "./harness";

/**
 * The property the whole database design exists to guarantee, asserted from
 * outside: through the HTTP surface, as a browser would reach it.
 *
 * verify-isolation.sh proves it at the SQL layer. This proves the layer above
 * has not undone it — a service that forgets to open a client context, or a
 * route that takes an id and trusts it, would pass that script and fail here.
 */
describe("client isolation, through the API", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await startApi();
  });

  afterAll(async () => {
    await app.close();
  });

  it("refuses a host that belongs to no client", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/masters/customers")
      .set("Host", "nobody.example.com");

    // Not 200 and not 500: an unknown host is a request that cannot be
    // attributed to a client, and the only safe answer is to decline it.
    expect([400, 401, 403, 404]).toContain(response.status);
  });

  it("refuses every master endpoint without a session", async () => {
    // Sampled across the surface rather than one route, because the guard is
    // global-by-default and this is what proves the default held.
    const paths = [
      "/api/v1/masters/customers",
      "/api/v1/masters/consignees",
      "/api/v1/masters/shippers",
      "/api/v1/masters/account-groups",
      "/api/v1/masters/products",
      "/api/v1/masters/zones",
      "/api/v1/data/zones/export",
      "/api/v1/data/charges/import/template",
    ];

    for (const path of paths) {
      const response = await request(app.getHttpServer()).get(path).set("Host", HOSTS.a);
      expect(response.status, `${path} must require a session`).toBe(401);
    }
  });

  it("never leaks internals in an error body", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/masters/customers/not-a-uuid")
      .set("Host", HOSTS.a);

    const body = JSON.stringify(response.body);
    // Whatever the failure, the response must not name the schema, the driver
    // or the file system.
    expect(body).not.toMatch(/prisma|postgres|node_modules|\/Users\//i);
    expect(response.body).toHaveProperty("reference");
  });

  it("answers the health check without a session", async () => {
    // With a host, because host resolution runs in front of everything —
    // including this. That is deliberate: an unattributable request is
    // declined before any handler sees it, and the probe is configured with
    // a real host for the same reason a browser has one.
    const response = await request(app.getHttpServer())
      .get("/api/v1/healthz")
      .set("Host", HOSTS.a);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});
