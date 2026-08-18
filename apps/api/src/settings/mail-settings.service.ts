import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { requireRequestContext } from "../core/context/request-context";
import { PrismaService } from "../core/database/prisma.service";
import { AppError } from "../core/errors/app-error";
import { MailService } from "../core/mail/mail.service";
import { paginate, type PageRequest } from "../masters/paged";

/**
 * A client's outgoing mail: how it is sent, and what has been sent.
 *
 * The password is the one field with special handling. It is never
 * returned — the view says whether one is set — and an empty password on
 * save means "keep the one you have", because a settings form that made
 * people re-type a secret to change the sender name would teach them to
 * keep it in a text file. It is sealed before it is stored and only the
 * mail service opens it.
 */
export const mailSettingsSchema = z
  .object({
    provider: z.enum(["PLATFORM", "SMTP"]),
    smtpHost: z.string().trim().max(253).nullish(),
    smtpPort: z.coerce.number().int().min(1).max(65535).nullish(),
    smtpSecure: z.coerce.boolean().default(false),
    smtpUsername: z.string().trim().max(320).nullish(),
    /** Empty or absent keeps the stored password; a value replaces it. */
    smtpPassword: z.string().max(1024).nullish(),
    fromName: z.string().trim().max(120).nullish(),
    fromEmail: z.string().trim().email("Enter a valid sender address.").max(320).nullish(),
    replyTo: z.string().trim().email("Enter a valid reply-to address.").max(320).nullish(),
  })
  .superRefine((value, ctx) => {
    if (value.provider !== "SMTP") return;
    if (!value.smtpHost) ctx.addIssue({ code: "custom", path: ["smtpHost"], message: "An SMTP server needs a host." });
    if (!value.smtpPort) ctx.addIssue({ code: "custom", path: ["smtpPort"], message: "An SMTP server needs a port." });
    if (!value.fromEmail) ctx.addIssue({ code: "custom", path: ["fromEmail"], message: "Your own server needs a sender address on your domain." });
  });

export type MailSettingsInput = z.infer<typeof mailSettingsSchema>;

export interface MailSettingsView {
  provider: "PLATFORM" | "SMTP";
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUsername: string | null;
  hasPassword: boolean;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
  updatedAt: string | null;
  platformFrom: { name: string; email: string };
}

@Injectable()
export class MailSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async view(): Promise<MailSettingsView> {
    const { clientId } = requireRequestContext();
    const row = await this.prisma.forClient(clientId!, async (tx) => tx.mailSettings.findFirst());
    return {
      provider: row?.provider ?? "PLATFORM",
      smtpHost: row?.smtpHost ?? null,
      smtpPort: row?.smtpPort ?? null,
      smtpSecure: row?.smtpSecure ?? false,
      smtpUsername: row?.smtpUsername ?? null,
      hasPassword: Boolean(row?.smtpPasswordEncrypted),
      fromName: row?.fromName ?? null,
      fromEmail: row?.fromEmail ?? null,
      replyTo: row?.replyTo ?? null,
      lastTestedAt: row?.lastTestedAt?.toISOString() ?? null,
      lastTestOk: row?.lastTestOk ?? null,
      lastTestError: row?.lastTestError ?? null,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
      platformFrom: this.mail.platformFrom,
    };
  }

  async update(input: MailSettingsInput): Promise<void> {
    const { clientId, actor, ip, userAgent } = requireRequestContext();

    await this.prisma.forClient(clientId!, async (tx) => {
      const existing = await tx.mailSettings.findFirst();
      const smtpPasswordEncrypted =
        input.smtpPassword && input.smtpPassword.length > 0
          ? this.mail.secrets.seal(input.smtpPassword)
          : input.provider === "SMTP"
            ? (existing?.smtpPasswordEncrypted ?? null)
            : null; // Back on the platform transport: no reason to keep a secret.

      const data = {
        provider: input.provider,
        smtpHost: input.provider === "SMTP" ? (input.smtpHost ?? null) : null,
        smtpPort: input.provider === "SMTP" ? (input.smtpPort ?? null) : null,
        smtpSecure: input.provider === "SMTP" ? input.smtpSecure : false,
        smtpUsername: input.provider === "SMTP" ? (input.smtpUsername ?? null) : null,
        smtpPasswordEncrypted,
        fromName: input.fromName ?? null,
        fromEmail: input.fromEmail ?? null,
        replyTo: input.replyTo ?? null,
        // A change invalidates the last test: it tested something else.
        lastTestedAt: null,
        lastTestOk: null,
        lastTestError: null,
        updatedById: actor?.userId ?? null,
      };

      if (existing) await tx.mailSettings.update({ where: { id: existing.id }, data });
      else await tx.mailSettings.create({ data: { clientId: clientId!, ...data } });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "settings.mail.updated",
          entity: "mail_settings",
          metadata: {
            provider: input.provider,
            smtpHost: data.smtpHost,
            fromEmail: data.fromEmail,
            passwordChanged: Boolean(input.smtpPassword),
          },
          ip: ip ?? null,
          userAgent: userAgent ?? null,
        },
      });
    });

    this.mail.forget(clientId!);
  }

  /** Sends a test message to the signed-in person and records the outcome. */
  async test(): Promise<{ ok: boolean; to: string; error?: string }> {
    const { clientId, actor } = requireRequestContext();
    if (!actor) throw new AppError(401, "unauthenticated", "Sign in to send a test message.");

    let ok = true;
    let error: string | undefined;
    try {
      const settings = await this.prisma.forClient(clientId!, async (tx) => tx.clientSettings.findFirst());
      const senderName = settings?.tradingName || settings?.legalName || "ExcelEx";
      await this.mail.sendTest(clientId!, actor.email, senderName);
    } catch (failure) {
      ok = false;
      error = failure instanceof Error ? failure.message : String(failure);
    }

    await this.prisma.forClient(clientId!, async (tx) => {
      const existing = await tx.mailSettings.findFirst();
      const data = { lastTestedAt: new Date(), lastTestOk: ok, lastTestError: ok ? null : (error ?? "").slice(0, 1000) };
      if (existing) await tx.mailSettings.update({ where: { id: existing.id }, data });
      else await tx.mailSettings.create({ data: { clientId: clientId!, ...data } });
      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor.userId,
          action: "settings.mail.tested",
          entity: "mail_settings",
          metadata: { ok, to: actor.email, error: error ?? null },
        },
      });
    });

    return { ok, to: actor.email, ...(error ? { error } : {}) };
  }

  /** The outbox, newest first. */
  async messages(query: PageRequest & { status?: string; template?: string; search?: string }) {
    const { clientId } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) =>
      paginate(
        tx.mailMessage,
        {
          where: {
            ...(query.status ? { status: query.status as never } : {}),
            ...(query.template ? { template: query.template } : {}),
            ...(query.search ? { OR: [{ toEmail: { contains: query.search, mode: "insensitive" } }, { subject: { contains: query.search, mode: "insensitive" } }] } : {}),
          },
          orderBy: { createdAt: "desc" },
          request: query,
        },
        (row: {
          id: string; toEmail: string; toName: string | null; subject: string; template: string; status: string;
          attempts: number; error: string | null; createdAt: Date; sentAt: Date | null; referenceType: string | null; referenceId: string | null;
        }) => ({
          id: row.id,
          to: row.toName ? `${row.toName} <${row.toEmail}>` : row.toEmail,
          subject: row.subject,
          template: row.template,
          status: row.status,
          attempts: row.attempts,
          error: row.error,
          reference: row.referenceType ? `${row.referenceType}:${row.referenceId}` : null,
          createdAt: row.createdAt.toISOString(),
          sentAt: row.sentAt?.toISOString() ?? null,
        }),
      ),
    );
  }
}
