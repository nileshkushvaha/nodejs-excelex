import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";

import { PrismaService } from "../database/prisma.service";
import { logEvent } from "./log-event";
import { redact } from "./redact";

/**
 * Keeps server-side failures where an operator can read them.
 *
 * The log line has the detail and the reporter raises the alarm; this writes
 * the same failure to the client's own tables — an event, and a group it
 * belongs to — so the Exceptions screen can show "this has happened 40
 * times since Tuesday, last at 09:12, here is the stack, here is the
 * reference". Never throws: a recorder that fails must not become the
 * failure it was recording, so it logs and moves on.
 *
 * Only what has a client is recorded. A failure before the client is known
 * (an unknown host, a malformed body on the way in) has no table to go in
 * and is in the log and the metrics like everything else.
 */
export interface ExceptionRecord {
  readonly clientId: string | undefined;
  readonly source: "http" | "job" | "scheduler";
  readonly code: string;
  readonly status?: number;
  readonly exception: unknown;
  readonly requestId?: string;
  readonly method?: string;
  readonly route?: string;
  readonly path?: string;
  readonly actorId?: string;
  readonly ip?: string;
  readonly context?: Record<string, unknown>;
}

const MESSAGE_MAX = 2_000;
const STACK_MAX = 8_000;

@Injectable()
export class ExceptionRecorder {
  private readonly logger = new Logger(ExceptionRecorder.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Fire-and-forget from the caller's point of view; awaits internally. */
  record(input: ExceptionRecord): void {
    void this.write(input).catch((error: unknown) => {
      logEvent(this.logger, "warn", "exception.record_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }

  private async write(input: ExceptionRecord): Promise<void> {
    if (!input.clientId) return;
    const clientId = input.clientId;
    const error = input.exception instanceof Error ? input.exception : null;
    const exceptionName = error?.name ?? typeof input.exception;
    const message = (error?.message ?? String(input.exception)).replace(/^\s*Invalid `[^`]+` invocation:\s*/u, "").trim().slice(0, MESSAGE_MAX) || exceptionName;
    const stack = error?.stack?.slice(0, STACK_MAX) ?? null;
    const fingerprint = fingerprintOf(input.source, input.code, exceptionName, input.route);
    const title = `${input.code} · ${exceptionName}${input.route ? ` · ${input.method ?? ""} ${input.route}`.trimEnd() : ""}`;
    const now = new Date();

    await this.prisma.forClient(clientId, async (tx) => {
      const event = await tx.exceptionEvent.create({
        data: {
          clientId,
          fingerprint,
          source: input.source,
          requestId: input.requestId ?? null,
          method: input.method ?? null,
          route: input.route ?? null,
          path: input.path ?? null,
          status: input.status ?? null,
          code: input.code,
          exceptionName,
          message,
          stack,
          actorId: input.actorId ?? null,
          ip: input.ip ?? null,
          context: input.context ? (redact(input.context) as never) : undefined,
        },
      });

      const existing = await tx.exceptionGroup.findFirst({ where: { fingerprint } });
      if (!existing) {
        await tx.exceptionGroup.create({
          data: {
            clientId,
            fingerprint,
            title,
            code: input.code,
            exceptionName,
            route: input.route ?? null,
            source: input.source,
            count: 1,
            firstSeenAt: now,
            lastSeenAt: now,
            lastEventId: event.id,
          },
        });
      } else {
        await tx.exceptionGroup.update({
          where: { id: existing.id },
          data: {
            count: { increment: 1 },
            lastSeenAt: now,
            lastEventId: event.id,
            // Resolved and back: it was not resolved. Ignored stays ignored —
            // that is what ignoring means.
            ...(existing.status === "RESOLVED" ? { status: "OPEN", regressedAt: now, resolvedAt: null, resolvedById: null } : {}),
          },
        });
      }
    });
  }
}

/** The same failure by cause and place, not by request or by message text. */
export function fingerprintOf(source: string, code: string, exceptionName: string, route?: string): string {
  return createHash("sha256").update([source, code, exceptionName, route ?? ""].join("|")).digest("hex").slice(0, 32);
}
