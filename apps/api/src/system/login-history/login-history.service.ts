import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../../core/database/prisma.service";

/**
 * The outcomes a sign-in can have, as the database enum spells them.
 *
 * Listed here rather than imported from the generated client so the API's own
 * code names the vocabulary it writes — a filter dropdown, a CSV column and a
 * Zod enum all read from this one list.
 */
export const LOGIN_OUTCOMES = [
  "SUCCEEDED",
  "BAD_PASSWORD",
  "INACTIVE",
  "LOCKED",
  "LOCKED_OUT",
  "UNKNOWN_USER",
  "THROTTLED",
] as const;

export type LoginOutcome = (typeof LOGIN_OUTCOMES)[number];

export interface LoginAttemptInput {
  readonly userId: string | null;
  readonly email: string;
  readonly outcome: LoginOutcome;
  readonly host: string;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
  readonly sessionId?: string | null;
}

/**
 * The narrowest view of a transaction that can write a login attempt. Typed
 * structurally so the auth service can hand in whichever transaction it is
 * already inside — the failure counter's, or the one that issues the session —
 * and the attempt row commits or rolls back with the thing it describes.
 */
export interface LoginAttemptWriter {
  loginAttempt: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
}

/**
 * Writes the login history.
 *
 * Kept apart from AuthService because it has one job and one rule: it must
 * never be the reason a sign-in fails. A history table that is briefly
 * unwritable is an operations problem; a sign-in that refuses because the
 * history table is unwritable is an outage. So the recorder swallows and logs
 * rather than throws, on both paths.
 *
 * `record()` opens its own client transaction, for the branches where the
 * caller has none (an unknown address, a locked account). `recordIn()` writes
 * inside a transaction the caller already holds, so a row is never orphaned
 * from the failure counter or session it belongs with. A failed statement
 * poisons a Postgres transaction whatever the caller catches, so `recordIn`
 * does not pretend otherwise: it is written last in each unit of work, and
 * the caller's own error handling covers it.
 */
@Injectable()
export class LoginHistoryService {
  private readonly logger = new Logger(LoginHistoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(clientId: string, attempt: LoginAttemptInput): Promise<void> {
    try {
      await this.prisma.forClient(clientId, async (tx) => {
        await this.recordIn(tx, clientId, attempt);
      });
    } catch (error) {
      this.logger.error(
        `Could not record ${attempt.outcome} sign-in for ${attempt.email}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async recordIn(tx: LoginAttemptWriter, clientId: string, attempt: LoginAttemptInput): Promise<void> {
    await tx.loginAttempt.create({
      data: {
        clientId,
        userId: attempt.userId,
        email: attempt.email,
        outcome: attempt.outcome,
        host: attempt.host,
        ip: attempt.ip ?? null,
        userAgent: attempt.userAgent ?? null,
        sessionId: attempt.sessionId ?? null,
      },
    });
  }
}
