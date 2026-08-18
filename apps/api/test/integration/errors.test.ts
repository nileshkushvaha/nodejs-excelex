import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HOSTS, signInTestAdmin, startApi } from "./harness";

/**
 * The error contract, asserted over HTTP.
 *
 * Every failure leaves through one filter and arrives in one shape; these
 * tests pin that shape at the edges where it is easiest to break: before the
 * request context exists (a cross-origin refusal), before the body is
 * parsed (malformed JSON), at the validation boundary (field errors), and
 * for a deliberate NotFound.
 */
describe("the error envelope", () => {
  let app: INestApplication;
  let cookie: string;

  beforeAll(async () => {
    app = await startApi();
    cookie = await signInTestAdmin(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it("carries one correlation id in the body and the header", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/masters/customers/00000000-0000-4000-8000-000000000000")
      .set("host", HOSTS.a)
      .set("cookie", cookie);

    expect(response.status, JSON.stringify(response.body)).toBe(404);
    expect(response.body.code).toBe("not_found");
    expect(typeof response.body.message).toBe("string");
    // reference === requestId === X-Request-Id: one id names the request in
    // the response, the header, the log line and the audit row.
    expect(response.body.reference).toBe(response.body.requestId);
    expect(response.headers["x-request-id"]).toBe(response.body.reference);
  });

  it("returns field-level validation errors with paths", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/masters/customers")
      .set("host", HOSTS.a)
      .set("cookie", cookie)
      .send({ code: "" });

    expect(response.status, JSON.stringify(response.body)).toBe(400);
    expect(response.body.code, JSON.stringify(response.body)).toBe("validation_failed");
    expect(Array.isArray(response.body.message), JSON.stringify(response.body)).toBe(true);
    expect(Array.isArray(response.body.errors), JSON.stringify(response.body)).toBe(true);
    const first = response.body.errors[0] as { path: string; message: string; code?: string };
    expect(typeof first.path).toBe("string");
    expect(typeof first.message).toBe("string");
    // The messages array is unchanged from before, so a client that reads
    // message[0] sees what it always saw.
    expect(response.body.message[0]).toBe(first.message);
  });

  it("renders a cross-origin refusal through the filter, not Express's default handler", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/profile")
      .set("host", HOSTS.a)
      .set("origin", "https://evil.example")
      .set("cookie", cookie)
      .send({ fullName: "x" });

    expect(response.status).toBe(403);
    expect(response.headers["content-type"]).toMatch(/json/);
    expect(response.body.code).toBe("origin_rejected");
    expect(typeof response.body.reference).toBe("string");
    expect(response.headers["x-request-id"]).toBe(response.body.reference);
  });

  it("explains malformed JSON as a 400 rather than a 500", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set("host", HOSTS.a)
      .set("content-type", "application/json")
      .send('{"email": ');

    expect(response.status).toBe(400);
    expect(response.body.code, JSON.stringify(response.body)).toBe("malformed_body");
  });

  it("gives an unauthenticated request a code, not just a sentence", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/masters/customers")
      .set("host", HOSTS.a);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("unauthenticated");
  });

  it("counts failures by code and remembers server errors on the performance screen", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/system/performance/errors")
      .set("host", HOSTS.a)
      .set("cookie", cookie);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.errors)).toBe(true);

    const metrics = await request(app.getHttpServer()).get("/api/metrics").set("host", HOSTS.a);
    expect(metrics.text).toContain("excelex_http_errors_total");
  });
});
