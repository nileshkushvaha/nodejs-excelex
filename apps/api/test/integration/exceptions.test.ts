import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaService } from "../../src/core/database/prisma.service";
import { QueueService } from "../../src/jobs/queue.service";
import { HOSTS, TEST_ADMIN, signInTestAdmin, startApi } from "./harness";

/**
 * Exceptions: a background failure becomes an event and a group; the group
 * lists, details, resolves, and reopens on a regression.
 */
describe("exceptions", () => {
  let app: INestApplication;
  let cookie: string;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await startApi();
    cookie = await signInTestAdmin(app);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  const failOnce = async () => {
    const queues = app.get(QueueService);
    // A name with no handler fails on its only attempt: recorded as a job exception.
    const { id } = await queues.enqueue("system.nonexistent" as never, {}, { clientId: TEST_ADMIN.clientId, requestedById: null, maxAttempts: 1 });
    for (let i = 0; i < 80; i += 1) {
      const row = await prisma.forClient(TEST_ADMIN.clientId, async (tx) => tx.job.findFirst({ where: { id } }));
      if (row && row.status !== "QUEUED" && row.status !== "RUNNING") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    // The recorder writes after the worker's failed event; give it a beat.
    await new Promise((resolve) => setTimeout(resolve, 300));
    return id;
  };

  it("records a failed job as an event under a group, and serves it", async () => {
    await failOnce();
    const list = await request(app.getHttpServer()).get("/api/v1/system/exceptions?search=nonexistent").set("host", HOSTS.a).set("cookie", cookie);
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    const group = list.body.rows.find((row: { code: string }) => row.code === "job_failed:system.nonexistent");
    expect(group, JSON.stringify(list.body)).toBeDefined();
    expect(group.count).toBeGreaterThanOrEqual(1);
    expect(group.status).toBe("OPEN");

    const detail = await request(app.getHttpServer()).get(`/api/v1/system/exceptions/${group.fingerprint}`).set("host", HOSTS.a).set("cookie", cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.events.length).toBeGreaterThanOrEqual(1);
    expect(detail.body.events[0].message).toMatch(/No handler/);
    expect(typeof detail.body.events[0].stack).toBe("string");

    const summary = await request(app.getHttpServer()).get("/api/v1/system/exceptions/summary").set("host", HOSTS.a).set("cookie", cookie);
    expect(summary.body.openGroups).toBeGreaterThanOrEqual(1);
  });

  it("resolves a group and reopens it when the failure comes back", async () => {
    const list = await request(app.getHttpServer()).get("/api/v1/system/exceptions?search=nonexistent").set("host", HOSTS.a).set("cookie", cookie);
    const group = list.body.rows[0];
    const resolved = await request(app.getHttpServer()).post(`/api/v1/system/exceptions/${group.fingerprint}/resolve`).set("host", HOSTS.a).set("cookie", cookie);
    expect(resolved.status).toBe(200);
    expect(resolved.body.status).toBe("RESOLVED");

    await failOnce();
    const again = await request(app.getHttpServer()).get(`/api/v1/system/exceptions/${group.fingerprint}`).set("host", HOSTS.a).set("cookie", cookie);
    expect(again.body.group.status).toBe("OPEN");
    expect(again.body.group.regressedAt).not.toBeNull();

    // Ignored stays ignored.
    await request(app.getHttpServer()).post(`/api/v1/system/exceptions/${group.fingerprint}/ignore`).set("host", HOSTS.a).set("cookie", cookie);
    await failOnce();
    const still = await request(app.getHttpServer()).get(`/api/v1/system/exceptions/${group.fingerprint}`).set("host", HOSTS.a).set("cookie", cookie);
    expect(still.body.group.status).toBe("IGNORED");
    await request(app.getHttpServer()).post(`/api/v1/system/exceptions/${group.fingerprint}/reopen`).set("host", HOSTS.a).set("cookie", cookie);
  });
});
