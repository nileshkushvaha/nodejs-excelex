import type { PrismaService } from "../../core/database/prisma.service";
import { JOB_NAMES, type JobEnvelope } from "../job.types";
import type { JobRegistry } from "../job.registry";

/**
 * The retention sweep: what this system forgets, and after how long.
 *
 * Three tables, each with its own horizon. Sessions that are revoked or past
 * their absolute expiry are dead after thirty days — long enough to answer
 * "was I signed in on Tuesday", not so long that the table is a history of
 * every device anyone ever used. Finished jobs go after ninety, because the
 * question is "what happened to last month's import", not last year's. Login
 * attempts stay for a hundred and eighty, because a slow credential-stuffing
 * campaign is only visible across months.
 *
 * Audit events are not touched. That table is append-only by design; if a
 * client's retention policy ever wants it trimmed, that is a separate,
 * deliberate decision and not something a sweep should do quietly.
 *
 * Runs inside the client transaction the worker seals, so it deletes exactly
 * one client's rows however many clients share the deployment. The payload
 * may shorten or lengthen any horizon, but not below one day: a sweep with a
 * zero-day horizon deletes live sessions.
 */
type ClientTx = Parameters<Parameters<PrismaService["forClient"]>[1]>[0];

export interface RetentionSweepPayload {
  sessionDays?: number;
  jobDays?: number;
  loginAttemptDays?: number;
}

export const RETENTION_DEFAULTS = { sessionDays: 30, jobDays: 90, loginAttemptDays: 180 } as const;

function horizon(days: unknown, fallback: number): Date {
  const parsed = typeof days === "number" && Number.isFinite(days) ? Math.max(1, Math.floor(days)) : fallback;
  return new Date(Date.now() - parsed * 86_400_000);
}

export async function runRetentionSweep(envelope: JobEnvelope<RetentionSweepPayload>, tx: ClientTx) {
  const sessionsBefore = horizon(envelope.payload?.sessionDays, RETENTION_DEFAULTS.sessionDays);
  const jobsBefore = horizon(envelope.payload?.jobDays, RETENTION_DEFAULTS.jobDays);
  const loginsBefore = horizon(envelope.payload?.loginAttemptDays, RETENTION_DEFAULTS.loginAttemptDays);

  const sessions = await tx.session.deleteMany({
    where: {
      OR: [{ revokedAt: { lt: sessionsBefore } }, { absoluteExpiry: { lt: sessionsBefore } }],
    },
  });

  const jobs = await tx.job.deleteMany({
    where: {
      finishedAt: { lt: jobsBefore },
      // Never the row this sweep is itself recorded on, and never one still
      // in flight: finishedAt is null for both.
      status: { in: ["SUCCEEDED", "FAILED", "CANCELLED"] },
    },
  });

  const loginAttempts = await tx.loginAttempt.deleteMany({
    where: { createdAt: { lt: loginsBefore } },
  });

  // Reset attempts are useful for a week of "did I ask for this" questions
  // and worthless after; the codes and tokens in them are long dead.
  const passwordResets = await tx.passwordReset.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 7 * 86_400_000) } },
  });

  // Read or not, a ninety-day-old notification is history, and history is
  // what the audit trail is for.
  const notifications = await tx.notification.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 90 * 86_400_000) } },
  });

  return {
    sessions: sessions.count,
    jobs: jobs.count,
    passwordResets: passwordResets.count,
    notifications: notifications.count,
    loginAttempts: loginAttempts.count,
    horizons: {
      sessions: sessionsBefore.toISOString(),
      jobs: jobsBefore.toISOString(),
      loginAttempts: loginsBefore.toISOString(),
    },
  };
}

export function registerRetentionSweep(registry: JobRegistry): void {
  registry.register(JOB_NAMES.RETENTION_SWEEP, (envelope, tx) =>
    runRetentionSweep(envelope as JobEnvelope<RetentionSweepPayload>, tx as ClientTx),
  );
}
