import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";

import { ENVIRONMENT, type Environment } from "../config/environment";
import { currentRequestContext } from "../context/request-context";
import { PrismaService } from "../database/prisma.service";
import { AppError } from "../errors/app-error";
import { logEvent } from "../observability/log-event";
import { JobRegistry } from "../../jobs/job.registry";
import { JOB_NAMES, QUEUES } from "../../jobs/job.types";
import { QueueService } from "../../jobs/queue.service";
import { renderMail, type MailContent } from "./mail-template";
import { SecretBox } from "./secret-box";

/**
 * Sending email, without ever making a request wait for a mail server.
 *
 * `send()` writes an outbox row and enqueues a job; the job renders the
 * message and hands it to the transport, then records what happened on the
 * row. A refusing or slow SMTP server therefore costs a retry, not a
 * request, and "did the reset email go out" has an answer in the database.
 *
 * Which transport: the client's own SMTP server if they have configured
 * one, else the deployment's (SMTP_URL). Transports are built on demand and
 * kept per client, and dropped when the settings change. The client's SMTP
 * password is sealed at rest and opened only here, in the process that
 * needs it, for as long as it takes to build the transport.
 *
 * Bodies are not stored. A message that must be resent is re-rendered from
 * its template and the same inputs, which is why `send()` takes content,
 * not HTML — and why the outbox is small enough to keep for a long time.
 */
export interface SendRequest {
  readonly to: { email: string; name?: string | null };
  readonly template: string;
  readonly content: Omit<MailContent, "senderName">;
  readonly reference?: { type: string; id: string };
  /** Defaults to the request's client; required outside a request. */
  readonly clientId?: string;
}

export interface MailFailureEvent {
  readonly clientId: string;
  readonly messageId: string;
  readonly template: string;
  readonly to: string;
  readonly error: string;
  readonly provider: "PLATFORM" | "SMTP";
}

interface ResolvedTransport {
  readonly transporter: Transporter;
  readonly from: { name: string; address: string };
  readonly replyTo?: string;
  readonly provider: "PLATFORM" | "SMTP";
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private readonly box: SecretBox;
  private readonly transports = new Map<string, ResolvedTransport>();
  private readonly failureListeners: Array<(event: MailFailureEvent) => void> = [];

  constructor(
    @Inject(ENVIRONMENT) private readonly environment: Environment,
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    private readonly registry: JobRegistry,
  ) {
    this.box = new SecretBox(environment.SECRETS_KEY);
  }

  onModuleInit(): void {
    this.registry.register(JOB_NAMES.MAIL_SEND, async (envelope) => {
      const { messageId } = envelope.payload as { messageId: string };
      return this.deliver(envelope.clientId, messageId);
    });
  }

  get secrets(): SecretBox {
    return this.box;
  }

  /** What the platform transport sends as, for the settings screen to show. */
  get platformFrom(): { name: string; email: string } {
    return { name: this.environment.MAIL_FROM_NAME, email: this.environment.MAIL_FROM_EMAIL };
  }

  /** Queues a message. Returns the outbox row id, which is also the job's payload. */
  async send(request: SendRequest): Promise<{ messageId: string }> {
    const context = currentRequestContext();
    const clientId = request.clientId ?? context?.clientId;
    if (!clientId) throw new AppError(500, "mail_without_client", "Mail must belong to a client.");

    const row = await this.prisma.forClient(clientId, async (tx) =>
      tx.mailMessage.create({
        data: {
          clientId,
          toEmail: request.to.email.trim().toLowerCase(),
          toName: request.to.name ?? null,
          subject: request.content.subject,
          template: request.template,
          referenceType: request.reference?.type ?? null,
          referenceId: request.reference?.id ?? null,
          requestedById: context?.actor?.userId ?? null,
        },
      }),
    );

    // The content rides in the job payload rather than in the row: the row is
    // the durable record of the fact, the payload is what renders it once.
    const job = await this.queues.enqueue(
      JOB_NAMES.MAIL_SEND,
      { messageId: row.id, to: request.to, content: request.content },
      { clientId, requestedById: context?.actor?.userId ?? null, queue: QUEUES.DEFAULT, maxAttempts: 4 },
    );

    await this.prisma.forClient(clientId, async (tx) => {
      await tx.mailMessage.update({ where: { id: row.id }, data: { jobId: job.id } });
    });

    return { messageId: row.id };
  }

  /** The job's body: render, hand to the transport, record the outcome. */
  private async deliver(clientId: string, messageId: string): Promise<{ providerMessageId: string | null }> {
    const row = await this.prisma.forClient(clientId, async (tx) => tx.mailMessage.findFirst({ where: { id: messageId } }));
    if (!row) throw new AppError(500, "mail_message_missing", "The outbox row for this job no longer exists.");
    if (row.status === "SENT") return { providerMessageId: row.providerMessageId };

    // The job's own payload carries the content; the worker gives us only the
    // envelope, so it is read back from the jobs table.
    const job = row.jobId
      ? await this.prisma.forClient(clientId, async (tx) => tx.job.findFirst({ where: { id: row.jobId! } }))
      : null;
    const payload = (job?.payload ?? {}) as { to?: { email: string; name?: string | null }; content?: Omit<MailContent, "senderName"> };
    if (!payload.content) throw new AppError(500, "mail_content_missing", "The message content is not on the job.");

    const transport = await this.transportFor(clientId);
    const rendered = renderMail({ ...payload.content, senderName: transport.from.name });

    try {
      const info = await transport.transporter.sendMail({
        from: transport.from,
        replyTo: transport.replyTo,
        to: row.toName ? { name: row.toName, address: row.toEmail } : row.toEmail,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        headers: { "X-ExcelEx-Message": row.id, "X-ExcelEx-Template": row.template },
      });
      const providerMessageId = typeof info?.messageId === "string" ? info.messageId : null;
      await this.prisma.forClient(clientId, async (tx) => {
        await tx.mailMessage.update({
          where: { id: row.id },
          data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, providerMessageId, error: null },
        });
      });
      return { providerMessageId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.forClient(clientId, async (tx) => {
        await tx.mailMessage.update({
          where: { id: row.id },
          // FAILED only records the latest outcome; BullMQ decides whether to
          // retry, and a later success flips it back to SENT.
          data: { status: "FAILED", attempts: { increment: 1 }, error: message.slice(0, 2000) },
        });
      });
      logEvent(this.logger, "warn", "mail.delivery_failed", { clientId, messageId, template: row.template, provider: transport.provider, message });
      // The worker has already counted this attempt on the row.
      if (job && job.attempts >= job.maxAttempts) {
        for (const listener of this.failureListeners) {
          try {
            listener({ clientId, messageId, template: row.template, to: row.toEmail, error: message, provider: transport.provider });
          } catch {
            // A listener's failure is not the mail's problem.
          }
        }
      }
      throw error;
    }
  }

  /** Sends one message synchronously through the given settings — the test button. */
  async sendTest(clientId: string, to: string, senderName: string): Promise<{ providerMessageId: string | null }> {
    const transport = await this.transportFor(clientId, { fresh: true });
    const rendered = renderMail({
      subject: "ExcelEx test message",
      title: "Your outgoing mail works",
      paragraphs: [
        "This is a test message from ExcelEx. If you are reading it, the account's outgoing mail settings deliver.",
        `Sent through ${transport.provider === "SMTP" ? "your own SMTP server" : "the platform's mail server"} as ${transport.from.name} <${transport.from.address}>.`,
      ],
      senderName,
    });
    const info = await transport.transporter.sendMail({
      from: transport.from,
      replyTo: transport.replyTo,
      to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });
    return { providerMessageId: typeof info?.messageId === "string" ? info.messageId : null };
  }

  /**
   * Told when a message has failed for the last time. The notification
   * service listens, so the people who manage mail hear about a dead
   * message; a listener here rather than an import there, because the
   * notification service sends mail and the dependency must point one way.
   */
  onDeliveryFailed(listener: (event: MailFailureEvent) => void): void {
    this.failureListeners.push(listener);
  }

  /** Called when a client's settings change, so the next send rebuilds. */
  forget(clientId: string): void {
    this.transports.delete(clientId);
  }

  private async transportFor(clientId: string, options: { fresh?: boolean } = {}): Promise<ResolvedTransport> {
    if (!options.fresh) {
      const cached = this.transports.get(clientId);
      if (cached) return cached;
    }

    const settings = await this.prisma.forClient(clientId, async (tx) => tx.mailSettings.findFirst());
    const fromName = settings?.fromName?.trim() || this.environment.MAIL_FROM_NAME;
    const fromEmail = settings?.fromEmail?.trim() || this.environment.MAIL_FROM_EMAIL;
    const replyTo = settings?.replyTo?.trim() || undefined;

    let resolved: ResolvedTransport;
    if (settings?.provider === "SMTP" && settings.smtpHost && settings.smtpPort) {
      const password = settings.smtpPasswordEncrypted ? this.box.open(settings.smtpPasswordEncrypted) : undefined;
      resolved = {
        provider: "SMTP",
        from: { name: fromName, address: fromEmail },
        replyTo,
        transporter: nodemailer.createTransport({
          host: settings.smtpHost,
          port: settings.smtpPort,
          secure: settings.smtpSecure,
          auth: settings.smtpUsername ? { user: settings.smtpUsername, pass: password ?? "" } : undefined,
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
          socketTimeout: 20_000,
        }),
      };
    } else {
      resolved = {
        provider: "PLATFORM",
        from: { name: fromName, address: fromEmail },
        replyTo,
        transporter: this.platformTransport(),
      };
    }

    this.transports.set(clientId, resolved);
    return resolved;
  }

  private platform: Transporter | undefined;

  private platformTransport(): Transporter {
    if (this.platform) return this.platform;
    const url = this.environment.SMTP_URL;
    // "json" renders and returns the message without sending — for tests and
    // for a deployment that has not yet chosen a mail server, where sending
    // to nowhere is better than crashing the job.
    this.platform = url === "json" ? nodemailer.createTransport({ jsonTransport: true }) : nodemailer.createTransport(url);
    return this.platform;
  }
}
