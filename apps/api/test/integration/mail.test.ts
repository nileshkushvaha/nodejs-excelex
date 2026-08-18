import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaService } from "../../src/core/database/prisma.service";
import { MailService } from "../../src/core/mail/mail.service";
import { HOSTS, TEST_ADMIN, signInTestAdmin, startApi } from "./harness";

/**
 * Outgoing mail, end to end against Mailpit (SMTP_URL in .env) — or the
 * "json" transport in CI, where nothing listens on 1025.
 */
describe("outgoing mail", () => {
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

  it("saves settings, never returns the password, and keeps it on a blank re-save", async () => {
    const put = (body: unknown) =>
      request(app.getHttpServer()).put("/api/v1/settings/mail").set("host", HOSTS.a).set("cookie", cookie).send(body);

    let response = await put({
      provider: "SMTP",
      smtpHost: "smtp.example.test",
      smtpPort: 587,
      smtpSecure: false,
      smtpUsername: "mailer",
      smtpPassword: "top-secret",
      fromEmail: "ops@example.test",
      fromName: "Example Couriers",
    });
    expect(response.status, JSON.stringify(response.body)).toBe(204);

    let view = await request(app.getHttpServer()).get("/api/v1/settings/mail").set("host", HOSTS.a).set("cookie", cookie);
    expect(view.body.hasPassword).toBe(true);
    expect(JSON.stringify(view.body)).not.toContain("top-secret");
    expect(view.body.smtpHost).toBe("smtp.example.test");

    // Stored sealed, not in clear.
    const row = await prisma.forClient(TEST_ADMIN.clientId, async (tx) => tx.mailSettings.findFirst());
    expect(row?.smtpPasswordEncrypted).toMatch(/^v1:/);
    expect(row?.smtpPasswordEncrypted).not.toContain("top-secret");
    expect(app.get(MailService).secrets.open(row!.smtpPasswordEncrypted!)).toBe("top-secret");

    // Blank password on re-save keeps it.
    response = await put({ provider: "SMTP", smtpHost: "smtp.example.test", smtpPort: 587, smtpPassword: "", fromEmail: "ops@example.test" });
    expect(response.status).toBe(204);
    view = await request(app.getHttpServer()).get("/api/v1/settings/mail").set("host", HOSTS.a).set("cookie", cookie);
    expect(view.body.hasPassword).toBe(true);

    // Validation names the field.
    response = await put({ provider: "SMTP", smtpPort: 587 });
    expect(response.status).toBe(400);
    expect(response.body.errors.map((e: { path: string }) => e.path)).toContain("smtpHost");

    // Back to the platform transport for the rest of the suite (and drop the secret).
    response = await put({ provider: "PLATFORM" });
    expect(response.status).toBe(204);
    view = await request(app.getHttpServer()).get("/api/v1/settings/mail").set("host", HOSTS.a).set("cookie", cookie);
    expect(view.body.hasPassword).toBe(false);
  });

  it("sends a test message through the platform transport and records it", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/settings/mail/test")
      .set("host", HOSTS.a)
      .set("cookie", cookie);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.ok, JSON.stringify(response.body)).toBe(true);
    expect(response.body.to).toBe(TEST_ADMIN.email);

    const view = await request(app.getHttpServer()).get("/api/v1/settings/mail").set("host", HOSTS.a).set("cookie", cookie);
    expect(view.body.lastTestOk).toBe(true);
  });

  it("queues a message, delivers it in a job, and shows it in the outbox", async () => {
    const mail = app.get(MailService);
    const { messageId } = await mail.send({
      clientId: TEST_ADMIN.clientId,
      to: { email: "someone@example.test", name: "Someone" },
      template: "system.test",
      content: { subject: "Queued hello", title: "Hello", paragraphs: ["From the queue."] },
      reference: { type: "test", id: "1" },
    });

    let row = null as Awaited<ReturnType<typeof read>>;
    const read = () => prisma.forClient(TEST_ADMIN.clientId, async (tx) => tx.mailMessage.findFirst({ where: { id: messageId } }));
    for (let i = 0; i < 80 && (!row || row.status === "QUEUED"); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      row = await read();
    }
    expect(row?.status).toBe("SENT");
    expect(row?.sentAt).not.toBeNull();
    expect(row?.jobId).not.toBeNull();

    const outbox = await request(app.getHttpServer())
      .get("/api/v1/settings/mail/messages?search=someone@example.test")
      .set("host", HOSTS.a)
      .set("cookie", cookie);
    expect(outbox.status).toBe(200);
    expect(outbox.body.rows[0]).toMatchObject({ subject: "Queued hello", status: "SENT", template: "system.test" });

    await prisma.forClient(TEST_ADMIN.clientId, async (tx) => tx.mailMessage.deleteMany({ where: { id: messageId } }));
  });
});
