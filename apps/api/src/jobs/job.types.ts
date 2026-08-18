/**
 * The work this system can be asked to do in the background.
 *
 * A closed list, deliberately. A schedule row in the database names a job from
 * here; if it could name anything, a schedule would be a way to run arbitrary
 * code, and whoever may edit schedules is not necessarily whoever should be
 * able to do that.
 */
export const JOB_NAMES = {
  /** Applies a rate import too large to run inside a request. */
  RATE_IMPORT: "rate.import",
  /** Copies a tariff forward in bulk. */
  RATE_COPY: "rate.copy",
  /** Removes expired sessions and old audit rows, per the retention policy. */
  RETENTION_SWEEP: "retention.sweep",
  /** Proves the queue runs end to end. Does nothing else. */
  HEARTBEAT: "system.heartbeat",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export const QUEUES = {
  /** Anything a person is waiting on. Kept short so it stays responsive. */
  DEFAULT: "default",
  /** Imports and bulk writes: long, and must not block the rest. */
  BULK: "bulk",
  /** Timetabled work nobody is waiting on. */
  SCHEDULED: "scheduled",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/**
 * What every job carries.
 *
 * The client id is neither optional nor inferred. A worker runs outside any
 * request, so there is no host to resolve a client from — the job states which
 * client it belongs to and the runner seals that context before the handler
 * sees anything. Without it a job would either see no rows, because RLS admits
 * none, or would have to bypass RLS, which is worse.
 */
export interface JobEnvelope<T = Record<string, unknown>> {
  readonly clientId: string;
  /** The row in the jobs table this execution belongs to. */
  readonly jobId: string;
  /** Who asked. Null for scheduled work, which nobody asked for personally. */
  readonly requestedById: string | null;
  readonly payload: T;
}
