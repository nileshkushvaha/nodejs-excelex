import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaService } from "../../src/core/database/prisma.service";
import { HOSTS, TEST_ADMIN, ensureTestAdmin, startApi } from "./harness";

/**
 * The activity log, read through the API.
 *
 * The trail is append-only — the runtime role cannot delete what this test
 * writes — so every assertion is filtered by a marker unique to this run
 * rather than by "the whole table looks like X".
 */
const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";

const ADMIN_EMAIL = TEST_ADMIN.email;
const ADMIN_PASSWORD = TEST_ADMIN.password;

describe("the activity log", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;
  const marker = randomUUID();
  const entity = "test_marker";

  beforeAll(async () => {
    app = await startApi();
    await ensureTestAdmin(app);
    prisma = app.get(PrismaService);

    await prisma.forClient(CLIENT_A, async (tx) => {
      await tx.user.updateMany({
        where: { email: ADMIN_EMAIL },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    });

    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set("Host", HOSTS.a)
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(login.status).toBe(200);
    cookie = (login.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;

    // Two events with a unique entityId; one with metadata, one without.
    await prisma.forClient(CLIENT_A, async (tx) => {
      const actor = await tx.user.findFirst({ where: { email: ADMIN_EMAIL }, select: { id: true } });
      await tx.auditEvent.create({
        data: {
          clientId: CLIENT_A,
          actorId: actor!.id,
          action: "masters.customer.updated",
          entity,
          entityId: marker,
          metadata: { marker, changed: ["name"] },
          ip: "203.0.113.9",
        },
      });
      await tx.auditEvent.create({
        data: { clientId: CLIENT_A, actorId: null, action: "test.marker.created", entity, entityId: marker },
      });
    });
  });

  afterAll(async () => {
    await prisma.forClient(CLIENT_A, async (tx) => {
      await tx.loginAttempt.deleteMany({ where: { email: ADMIN_EMAIL, outcome: "SUCCEEDED", createdAt: { gte: new Date(Date.now() - 60_000) } } });
    });
    await app.close();
  });

  const get = (path: string) =>
    request(app.getHttpServer()).get(path).set("Host", HOSTS.a).set("Cookie", cookie);

  it("lists and filters, without the metadata body", async () => {
    const response = await get(`/api/v1/system/activity?entityId=${marker}`);
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);

    const rows = response.body.rows as Array<Record<string, unknown>>;
    const updated = rows.find((row) => row["action"] === "masters.customer.updated")!;
    expect(updated["actionLabel"]).toBe("Customer updated");
    expect(updated["hasMetadata"]).toBe(true);
    expect(updated).not.toHaveProperty("metadata");
    expect((updated["actor"] as { email: string }).email).toBe(ADMIN_EMAIL);

    const system = rows.find((row) => row["action"] === "test.marker.created")!;
    expect(system["actor"]).toBeNull();
    expect(system["hasMetadata"]).toBe(false);

    const byPrefix = await get(`/api/v1/system/activity?entityId=${marker}&actionPrefix=masters.customer`);
    expect(byPrefix.body.total).toBe(1);

    const bySearch = await get(`/api/v1/system/activity?search=${marker}`);
    expect(bySearch.body.total).toBe(2);

    const byIp = await get(`/api/v1/system/activity?entityId=${marker}&ip=203.0.113.9`);
    expect(byIp.body.total).toBe(1);
  });

  it("returns the full row, metadata included, by id", async () => {
    const list = await get(`/api/v1/system/activity?entityId=${marker}&action=masters.customer.updated`);
    const id = list.body.rows[0].id as string;

    const detail = await get(`/api/v1/system/activity/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.metadata).toEqual({ marker, changed: ["name"] });
    expect(detail.body).toHaveProperty("userAgent");

    const timeline = await get(`/api/v1/system/activity/entity/${entity}/${marker}`);
    expect(timeline.status).toBe(200);
    expect(timeline.body).toHaveLength(2);
    expect(timeline.body[0].action).toBe("masters.customer.updated");
  });

  it("offers facets and a summary", async () => {
    const facets = await get("/api/v1/system/activity/facets");
    expect(facets.status).toBe(200);
    const domains = facets.body.domains as Array<{ domain: string; actions: Array<{ action: string }> }>;
    expect(domains.map((row) => row.domain)).toContain("test");
    expect(facets.body.entities).toContain(entity);
    expect((facets.body.actors as Array<{ actor: { email: string } }>).some((row) => row.actor.email === ADMIN_EMAIL)).toBe(true);

    const summary = await get("/api/v1/system/activity/summary?days=7");
    expect(summary.status).toBe(200);
    expect(summary.body.totals.events).toBeGreaterThanOrEqual(2);
    expect(summary.body.totals.perDay).toHaveLength(7);
    expect((summary.body.byDomain as Array<{ domain: string }>).map((row) => row.domain)).toContain("test");
  });

  it("exports CSV with a header row and audits the export", async () => {
    const response = await get(`/api/v1/system/activity/export?entityId=${marker}`);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain("activity-");

    const lines = response.text.trim().split("\n");
    expect(lines[0]).toBe("When,Action,Label,Entity,Entity id,Actor,Actor email,IP,Request id");
    expect(lines).toHaveLength(3);

    const audited = await prisma.forClient(CLIENT_A, (tx) =>
      tx.auditEvent.findFirst({
        where: { action: "system.activity.exported", createdAt: { gte: new Date(Date.now() - 60_000) } },
        orderBy: { createdAt: "desc" },
      }),
    );
    expect(audited).not.toBeNull();
    expect((audited!.metadata as { rows: number }).rows).toBe(2);
  });

  it("refuses to show one client's trail to another", async () => {
    const seenByB = await prisma.forClient(CLIENT_B, (tx) =>
      tx.auditEvent.findMany({ where: { entityId: marker } }),
    );
    expect(seenByB).toHaveLength(0);
  });
});
