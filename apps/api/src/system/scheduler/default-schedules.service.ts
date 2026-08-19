import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../../core/database/prisma.service";
import { logEvent } from "../../core/observability/log-event";
import { JOB_NAMES, QUEUES } from "../../jobs/job.types";
import { computeNextRun } from "./schedule.service";

/**
 * The schedules every client should have without anyone creating them.
 *
 * The retention sweep exists as a job, but a job nobody schedules never
 * runs, and a client whose sessions and login history are never aged out
 * has a table that grows for ever. So each client gets a nightly sweep by
 * default: seeded for the development client, created for a client the
 * first time the scheduler sees it, and never re-created once it exists —
 * an administrator who pauses or deletes it has made a decision, and the
 * partial unique index on (client, name) is what keeps two instances from
 * creating it twice.
 *
 * Runs at 02:30 in the client's timezone (the default one, until a client
 * setting says otherwise): the quiet hour for a courier company. Payload is
 * empty, so the handler's own defaults (30/90/180 days) apply and can be
 * changed per client from the scheduler screen.
 */
export interface DefaultSchedule {
  readonly name: string;
  readonly description: string;
  readonly jobName: string;
  readonly cron: string;
  readonly timezone: string;
  readonly payload: Record<string, unknown>;
}

export const DEFAULT_SCHEDULES: readonly DefaultSchedule[] = [
  {
    name: "Nightly retention sweep",
    description:
      "Removes expired sessions, finished jobs and old login history per the retention policy. " +
      "Edit the payload to change the day counts; pause it to keep everything.",
    jobName: JOB_NAMES.RETENTION_SWEEP,
    cron: "30 2 * * *",
    timezone: "Asia/Kolkata",
    payload: {},
  },
  {
    name: "Publish scheduled content",
    description: "Publishes pages and posts whose scheduled time has arrived. Pause it to hold scheduled items back.",
    jobName: JOB_NAMES.CMS_PUBLISH_DUE,
    cron: "*/5 * * * *",
    timezone: "Asia/Kolkata",
    payload: {},
  },
];

@Injectable()
export class DefaultSchedulesService {
  private readonly logger = new Logger(DefaultSchedulesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates any default that a client does not have. Idempotent, and cheap
   * enough to run at every boot: one query across schedules, one across
   * clients, and an insert only where something is missing.
   */
  async ensureForAllClients(): Promise<number> {
    const clients = await this.prisma.platform.client.findMany({
      where: { status: { in: ["ACTIVE", "TRIAL"] } },
      select: { id: true },
    });
    let created = 0;
    for (const client of clients) created += await this.ensureForClient(client.id);
    if (created) this.logger.log(`Created ${created} default schedule(s).`);
    return created;
  }

  async ensureForClient(clientId: string): Promise<number> {
    // The scan is a cross-client read, which is what the jobs role is for;
    // the create is one client's row, written under that client's context.
    const existing = await this.prisma.jobs.jobSchedule.findMany({
      where: { clientId, jobName: { in: DEFAULT_SCHEDULES.map((d) => d.jobName) } },
      select: { jobName: true },
    });
    const have = new Set(existing.map((row) => row.jobName));

    let created = 0;
    for (const schedule of DEFAULT_SCHEDULES) {
      // Present, or once present and since deleted — either way, theirs.
      if (have.has(schedule.jobName)) continue;
      try {
        await this.prisma.forClient(clientId, async (tx) => {
          const row = await tx.jobSchedule.create({
            data: {
              clientId,
              name: schedule.name,
              description: schedule.description,
              queue: QUEUES.SCHEDULED,
              jobName: schedule.jobName,
              payload: schedule.payload as never,
              cron: schedule.cron,
              timezone: schedule.timezone,
              isActive: true,
              nextRunAt: computeNextRun(schedule.cron, schedule.timezone, new Date()),
            },
          });
          await tx.auditEvent.create({
            data: {
              clientId,
              actorId: null,
              action: "system.schedule.created",
              entity: "job_schedule",
              entityId: row.id,
              metadata: { name: schedule.name, jobName: schedule.jobName, seeded: true },
            },
          });
        });
        created += 1;
      } catch (error) {
        // Another instance got there first (unique on client + name), or
        // the client is in a state that refuses writes. Neither is ours to
        // fix here; both are logged and the loop goes on.
        logEvent(this.logger, "warn", "scheduler.default_not_created", {
          clientId,
          schedule: schedule.name,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return created;
  }
}
