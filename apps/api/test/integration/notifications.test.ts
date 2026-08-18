import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaService } from "../../src/core/database/prisma.service";
import { NotificationService } from "../../src/core/notifications/notification.service";
import { HOSTS, TEST_ADMIN, ensureTestAdmin, signInTestAdmin, startApi } from "./harness";

describe("notifications", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;
  let adminId: string;

  beforeAll(async () => {
    app = await startApi();
    adminId = (await ensureTestAdmin(app)).id;
    cookie = await signInTestAdmin(app);
    prisma = app.get(PrismaService);
    await prisma.forClient(TEST_ADMIN.clientId, async (tx) => {
      await tx.notification.deleteMany({ where: { userId: adminId } });
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("fans out to everyone holding a permission, resolved like the guard resolves it", async () => {
    const notifications = app.get(NotificationService);
    const count = await notifications.notify({
      clientId: TEST_ADMIN.clientId,
      permission: "system.queue.view",
      kind: "test.fanout",
      title: "Fan-out test",
      body: "Delivered to holders of system.queue.view.",
    });
    // The test administrator holds "*"; the reset-target fixture (if present) holds nothing.
    expect(count).toBeGreaterThanOrEqual(1);
    const mine = await prisma.forClient(TEST_ADMIN.clientId, async (tx) =>
      tx.notification.findMany({ where: { userId: adminId, kind: "test.fanout" } }),
    );
    expect(mine).toHaveLength(1);
    const bystander = await prisma.forClient(TEST_ADMIN.clientId, async (tx) =>
      tx.user.findFirst({ where: { email: "reset-target@excelex.in" }, select: { id: true } }),
    );
    if (bystander) {
      const others = await prisma.forClient(TEST_ADMIN.clientId, async (tx) =>
        tx.notification.findMany({ where: { kind: "test.fanout", userId: bystander.id } }),
      );
      expect(others).toHaveLength(0);
    }
  });

  it("serves the bell and marks read", async () => {
    const recent = await request(app.getHttpServer()).get("/api/v1/notifications/recent").set("host", HOSTS.a).set("cookie", cookie);
    expect(recent.status).toBe(200);
    expect(recent.body.unread).toBeGreaterThanOrEqual(1);
    const target = recent.body.rows.find((row: { kind: string }) => row.kind === "test.fanout");
    expect(target).toBeDefined();

    const read = await request(app.getHttpServer()).post(`/api/v1/notifications/${target.id}/read`).set("host", HOSTS.a).set("cookie", cookie);
    expect(read.status).toBe(200);
    expect(read.body.updated).toBe(1);

    const list = await request(app.getHttpServer()).get("/api/v1/notifications?unread=1&kind=test.fanout").set("host", HOSTS.a).set("cookie", cookie);
    expect(list.body.total).toBe(0);

    const all = await request(app.getHttpServer()).post("/api/v1/notifications/read").set("host", HOSTS.a).set("cookie", cookie).send({});
    expect(all.status).toBe(200);
    const count = await request(app.getHttpServer()).get("/api/v1/notifications/unread-count").set("host", HOSTS.a).set("cookie", cookie);
    expect(count.body.count).toBe(0);
  });

  it("tells a locked-out person, in the app and by mail", async () => {
    // A throwaway account locked by five wrong passwords.
    const { hashPassword } = await import("@excelex/database");
    const email = `lockme-${Date.now()}@excelex.in`;
    const userId = await prisma.forClient(TEST_ADMIN.clientId, async (tx) =>
      (await tx.user.create({ data: { clientId: TEST_ADMIN.clientId, email, fullName: "Lock Me", passwordHash: await hashPassword("Right-Password!2026") } })).id,
    );
    for (let i = 0; i < 5; i += 1) {
      await request(app.getHttpServer()).post("/api/v1/auth/login").set("host", HOSTS.a).send({ email, password: "wrong" });
    }
    // Notifications are fire-and-forget after the transaction; give them a moment.
    let rows: Array<{ kind: string; mailMessageId: string | null }> = [];
    for (let i = 0; i < 50 && rows.length === 0; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      rows = await prisma.forClient(TEST_ADMIN.clientId, async (tx) =>
        tx.notification.findMany({ where: { userId, kind: "auth.account_locked" } }),
      );
    }
    expect(rows).toHaveLength(1);
    expect(rows[0]!.mailMessageId).not.toBeNull();

    await prisma.forClient(TEST_ADMIN.clientId, async (tx) => {
      await tx.notification.deleteMany({ where: { userId } });
      await tx.mailMessage.deleteMany({ where: { toEmail: email } });
      await tx.loginAttempt.deleteMany({ where: { email } });
      await tx.user.delete({ where: { id: userId } });
    });
  });
});
