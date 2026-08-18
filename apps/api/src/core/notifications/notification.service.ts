import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { permissionMatches } from "@excelex/permissions";

import { effectivePermissions, toGrantSet, type UserWithGrants } from "../../auth/grants";
import { currentRequestContext } from "../context/request-context";
import { PrismaService } from "../database/prisma.service";
import { MailService } from "../mail/mail.service";
import type { MailContent } from "../mail/mail-template";
import { logEvent } from "../observability/log-event";

/**
 * Telling people things.
 *
 * One call — `notify()` — from anywhere in the code base: who, what kind,
 * how serious, what it says, where it links, and whether to email as well.
 * The recipients are named directly or described by a permission ("everyone
 * who may manage the queue"), resolved at that moment with the same
 * resolver the guard uses, so a notification about a failed job goes to the
 * people who could do something about it and to nobody else.
 *
 * Fan-out is per recipient: a row each, because read state is theirs. Email
 * is optional and goes through the outbox, so a mail server that is down
 * costs a retry, not the notification. Nothing here throws into the caller
 * — a lockout must still lock and a job must still fail even if the message
 * about it could not be written; failures are logged instead.
 */
export type Severity = "INFO" | "WARNING" | "CRITICAL";

export interface NotifyRequest {
  readonly clientId?: string;
  /** Explicit recipients, or everyone holding a permission, or both. */
  readonly userIds?: readonly string[];
  readonly permission?: string;
  readonly kind: string;
  readonly severity?: Severity;
  readonly title: string;
  readonly body: string;
  readonly href?: string;
  readonly entity?: { type: string; id: string };
  /** Also email each recipient with this content (subject/title default to the notification's). */
  readonly email?: { template: string; content?: Partial<Omit<MailContent, "senderName">> } | false;
  /** Do not notify these people (typically the actor who caused it). */
  readonly exclude?: readonly string[];
}

const GRANT_INCLUDE = {
  userRoles: { include: { role: { include: { rolePermissions: true } } } },
  userPermissions: true,
  memberships: true,
} as const;

@Injectable()
export class NotificationService implements OnModuleInit {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  onModuleInit(): void {
    // A message that will never be delivered is something the people who
    // manage mail should hear about — in the app, obviously, not by mail.
    this.mail.onDeliveryFailed((event) => {
      void this.notify({
        clientId: event.clientId,
        permission: "settings.mail.manage",
        kind: "mail.delivery_failed",
        severity: "WARNING",
        title: "An email could not be delivered",
        body: `A ${event.template} message to ${event.to} failed through the ${event.provider === "SMTP" ? "account's SMTP server" : "platform mail server"}: ${event.error.split("\n")[0]}`,
        href: "/settings/mail",
        entity: { type: "mail_message", id: event.messageId },
      });
    });
  }

  /** Returns how many people were notified. Never throws. */
  async notify(request: NotifyRequest): Promise<number> {
    const clientId = request.clientId ?? currentRequestContext()?.clientId;
    if (!clientId) {
      this.logger.warn({ event: "notification.without_client", kind: request.kind });
      return 0;
    }

    try {
      const recipients = await this.recipients(clientId, request);
      if (recipients.length === 0) return 0;

      for (const recipient of recipients) {
        let mailMessageId: string | null = null;
        if (request.email) {
          try {
            const sent = await this.mail.send({
              clientId,
              to: { email: recipient.email, name: recipient.fullName },
              template: request.email.template,
              reference: request.entity ? { type: request.entity.type, id: request.entity.id } : undefined,
              content: {
                subject: request.email.content?.subject ?? request.title,
                title: request.email.content?.title ?? request.title,
                paragraphs: request.email.content?.paragraphs ?? [request.body],
                cta: request.email.content?.cta,
                note: request.email.content?.note,
              },
            });
            mailMessageId = sent.messageId;
          } catch (error) {
            logEvent(this.logger, "warn", "notification.email_failed", {
              clientId,
              kind: request.kind,
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }

        await this.prisma.forClient(clientId, async (tx) => {
          await tx.notification.create({
            data: {
              clientId,
              userId: recipient.id,
              kind: request.kind,
              severity: request.severity ?? "INFO",
              title: request.title,
              body: request.body,
              href: request.href ?? null,
              entityType: request.entity?.type ?? null,
              entityId: request.entity?.id ?? null,
              mailMessageId,
            },
          });
        });
      }
      return recipients.length;
    } catch (error) {
      logEvent(this.logger, "error", "notification.failed", {
        clientId,
        kind: request.kind,
        message: error instanceof Error ? error.message : String(error),
      }, error instanceof Error ? error.stack : undefined);
      return 0;
    }
  }

  private async recipients(
    clientId: string,
    request: NotifyRequest,
  ): Promise<Array<{ id: string; email: string; fullName: string }>> {
    const exclude = new Set(request.exclude ?? []);
    const byId = new Map<string, { id: string; email: string; fullName: string }>();

    if (request.userIds?.length) {
      const users = await this.prisma.forClient(clientId, async (tx) =>
        tx.user.findMany({
          where: { id: { in: [...request.userIds!] }, deletedAt: null, isActive: true },
          select: { id: true, email: true, fullName: true },
        }),
      );
      for (const user of users) byId.set(user.id, user);
    }

    if (request.permission) {
      // Every active user, with their grants, resolved the way the guard
      // resolves them. Bounded by the size of a client's staff — tens to a
      // few hundred — and run only when something worth telling happens.
      const users = await this.prisma.forClient(clientId, async (tx) =>
        tx.user.findMany({ where: { deletedAt: null, isActive: true }, include: GRANT_INCLUDE }),
      );
      for (const user of users) {
        const granted = effectivePermissions(toGrantSet(user as unknown as UserWithGrants));
        if (granted.some((grant) => permissionMatches(grant, request.permission!))) {
          byId.set(user.id, { id: user.id, email: user.email, fullName: user.fullName });
        }
      }
    }

    return [...byId.values()].filter((user) => !exclude.has(user.id));
  }

  // ── Reading, for the bell and the page ────────────────────────────────

  async unreadCount(clientId: string, userId: string): Promise<number> {
    return this.prisma.forClient(clientId, async (tx) => tx.notification.count({ where: { userId, readAt: null } }));
  }

  async markRead(clientId: string, userId: string, ids: readonly string[] | "all"): Promise<number> {
    const result = await this.prisma.forClient(clientId, async (tx) =>
      tx.notification.updateMany({
        where: { userId, readAt: null, ...(ids === "all" ? {} : { id: { in: [...ids] } }) },
        data: { readAt: new Date() },
      }),
    );
    return result.count;
  }
}
