import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@excelex/database";
import { CronExpressionParser } from "cron-parser";
import { z } from "zod";

import { requireRequestContext } from "../../core/context/request-context";
import { PrismaService } from "../../core/database/prisma.service";
import { JOB_NAMES, QUEUES, type JobName, type QueueName } from "../../jobs/job.types";
import { serialise as serialiseJob } from "../../jobs/job.service";
import { QueueService } from "../../jobs/queue.service";
import { paginate, type PageRequest } from "../../masters/paged";

/**
 * Timezones offered by name. Short and curated rather than the whole IANA
 * list: this is a logistics system with clients in India and the Gulf, and a
 * select of six hundred zones is a worse control than a select of six.
 * Anything else valid is still accepted on the wire.
 */
export const SCHEDULE_TIMEZONES = [
  "Asia/Kolkata",
  "UTC",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
] as const;

const cronField = z
  .string()
  .trim()
  .refine((value) => value.split(/\s+/).length === 5, {
    message: "Cron must have five fields: minute hour day-of-month month day-of-week.",
  });

const timezoneField = z.string().trim().refine(isValidTimezone, {
  message: "Timezone must be a valid IANA name such as Asia/Kolkata.",
});

const jobNames = Object.values(JOB_NAMES) as [JobName, ...JobName[]];
const queueNames = Object.values(QUEUES) as [QueueName, ...QueueName[]];

export const scheduleInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters.")
      .max(80, "Name cannot exceed 80 characters."),
    description: z.string().trim().max(500, "Description cannot exceed 500 characters.").nullable().optional(),
    jobName: z.enum(jobNames, { message: "Job must be one the worker knows." }),
    queue: z.enum(queueNames, { message: "Queue must be default, bulk or scheduled." }).default(QUEUES.SCHEDULED),
    cron: cronField,
    timezone: timezoneField.default("Asia/Kolkata"),
    payload: z.record(z.string(), z.unknown(), { message: "Payload must be a JSON object." }).default({}),
    isActive: z.boolean().default(true),
  })
  .superRefine((value, context) => {
    // Parsed in its own timezone, because "0 2 * * *" is valid everywhere
    // but "0 2 30 2 *" never fires, and cron-parser is what will run it.
    try {
      CronExpressionParser.parse(value.cron, { tz: value.timezone });
    } catch (error) {
      context.addIssue({
        code: "custom",
        path: ["cron"],
        message: `Cron is not valid: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  });

export type ScheduleInput = z.infer<typeof scheduleInputSchema>;

export interface ScheduleListQuery extends PageRequest {
  isActive?: string;
  jobName?: string;
  search?: string;
}

/**
 * Schedules: what runs on a timetable, for this client.
 *
 * Client-scoped in every read and write here, because a schedule is a
 * client's decision about its own work. The dispatcher (scheduler.service)
 * is the one place that reads across clients, and it does so through the
 * jobs handle, not through this service.
 *
 * `nextRunAt` is computed on every save rather than lazily by the dispatcher,
 * so a schedule that has just been created or re-timed shows when it will
 * fire before it ever has.
 */
@Injectable()
export class ScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
  ) {}

  async list(query: ScheduleListQuery) {
    const { clientId } = requireRequestContext();

    const where: Prisma.JobScheduleWhereInput = {
      deletedAt: null,
      ...(query.isActive === "true" ? { isActive: true } : query.isActive === "false" ? { isActive: false } : {}),
      ...(query.jobName ? { jobName: query.jobName } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { description: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    return this.prisma.forClient(clientId!, async (tx) =>
      paginate(
        tx.jobSchedule,
        { where, orderBy: [{ isActive: "desc" }, { name: "asc" }], request: query },
        serialise,
      ),
    );
  }

  async byId(id: string) {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.jobSchedule.findFirst({ where: { id, deletedAt: null } });
      if (!row) throw new NotFoundException("Schedule not found.");
      const runs = await tx.job.findMany({
        where: { scheduleId: id },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      return { ...serialise(row), payload: row.payload, runs: runs.map(serialiseJob) };
    });
  }

  async create(input: ScheduleInput) {
    const { clientId, actor, ip, userAgent } = requireRequestContext();
    const nextRunAt = computeNextRun(input.cron, input.timezone, new Date());

    return this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.jobSchedule.create({
        data: {
          clientId: clientId!,
          name: input.name,
          description: input.description ?? null,
          jobName: input.jobName,
          queue: input.queue,
          cron: input.cron,
          timezone: input.timezone,
          payload: input.payload as never,
          isActive: input.isActive,
          nextRunAt: input.isActive ? nextRunAt : null,
        },
      });
      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "system.schedule.created",
          entity: "job_schedule",
          entityId: row.id,
          metadata: { name: row.name, jobName: row.jobName, cron: row.cron, timezone: row.timezone },
          ip,
          userAgent,
        },
      });
      return serialise(row);
    });
  }

  async update(id: string, input: ScheduleInput) {
    const { clientId, actor, ip, userAgent } = requireRequestContext();
    const nextRunAt = computeNextRun(input.cron, input.timezone, new Date());

    return this.prisma.forClient(clientId!, async (tx) => {
      const before = await tx.jobSchedule.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException("Schedule not found.");

      const row = await tx.jobSchedule.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description ?? null,
          jobName: input.jobName,
          queue: input.queue,
          cron: input.cron,
          timezone: input.timezone,
          payload: input.payload as never,
          isActive: input.isActive,
          nextRunAt: input.isActive ? nextRunAt : null,
        },
      });

      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const key of ["name", "description", "jobName", "queue", "cron", "timezone", "isActive"] as const) {
        if (before[key] !== row[key]) changes[key] = { from: before[key], to: row[key] };
      }
      if (JSON.stringify(before.payload) !== JSON.stringify(row.payload)) {
        changes["payload"] = { from: before.payload, to: row.payload };
      }

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "system.schedule.updated",
          entity: "job_schedule",
          entityId: row.id,
          metadata: changes,
          ip,
          userAgent,
        },
      });
      return serialise(row);
    });
  }

  /** Soft: the schedule's history of runs still points at it. */
  async remove(id: string): Promise<void> {
    const { clientId, actor, ip, userAgent } = requireRequestContext();

    await this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.jobSchedule.findFirst({ where: { id, deletedAt: null } });
      if (!row) throw new NotFoundException("Schedule not found.");

      await tx.jobSchedule.update({
        where: { id },
        // Deactivated as well as deleted, so the dispatcher's own filter
        // excludes it even if it only checked one of the two.
        data: { deletedAt: new Date(), isActive: false, nextRunAt: null },
      });
      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "system.schedule.deleted",
          entity: "job_schedule",
          entityId: row.id,
          metadata: { name: row.name, jobName: row.jobName },
          ip,
          userAgent,
        },
      });
    });
  }

  async setActive(id: string, isActive: boolean) {
    const { clientId, actor, ip, userAgent } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.jobSchedule.findFirst({ where: { id, deletedAt: null } });
      if (!row) throw new NotFoundException("Schedule not found.");

      const updated = await tx.jobSchedule.update({
        where: { id },
        data: {
          isActive,
          // Recomputed on activation, so a schedule paused for a month does
          // not fire the moment it wakes to catch up on a due time long past.
          nextRunAt: isActive ? computeNextRun(row.cron, row.timezone, new Date()) : null,
        },
      });
      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: isActive ? "system.schedule.activated" : "system.schedule.deactivated",
          entity: "job_schedule",
          entityId: row.id,
          metadata: { name: row.name },
          ip,
          userAgent,
        },
      });
      return serialise(updated);
    });
  }

  /** Fires the schedule's job now, outside its timetable, attributed to whoever asked. */
  async runNow(id: string): Promise<{ id: string; jobId: string }> {
    const { clientId, actor, ip, userAgent } = requireRequestContext();

    const row = await this.prisma.forClient(clientId!, async (tx) =>
      tx.jobSchedule.findFirst({ where: { id, deletedAt: null } }),
    );
    if (!row) throw new NotFoundException("Schedule not found.");

    const job = await this.queues.enqueue(row.jobName as JobName, row.payload as Record<string, unknown>, {
      queue: row.queue as QueueName,
      scheduleId: row.id,
    });

    await this.prisma.forClient(clientId!, async (tx) => {
      await tx.jobSchedule.update({ where: { id }, data: { lastRunAt: new Date() } });
      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "system.schedule.run",
          entity: "job_schedule",
          entityId: row.id,
          metadata: { name: row.name, jobName: row.jobName, jobId: job.id },
          ip,
          userAgent,
        },
      });
    });

    return { id: row.id, jobId: job.id };
  }
}

export function isValidTimezone(name: string): boolean {
  if (!name) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/** The next fire time strictly after `from`, in the schedule's own timezone. */
export function computeNextRun(cron: string, timezone: string, from: Date): Date {
  try {
    return CronExpressionParser.parse(cron, { tz: timezone, currentDate: from }).next().toDate();
  } catch (error) {
    throw new BadRequestException(
      `Cron is not valid: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function serialise(row: {
  id: string;
  name: string;
  description: string | null;
  queue: string;
  jobName: string;
  cron: string;
  timezone: string;
  isActive: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  lastStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
  payload?: unknown;
}) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    queue: row.queue,
    jobName: row.jobName,
    cron: row.cron,
    timezone: row.timezone,
    isActive: row.isActive,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    lastStatus: row.lastStatus,
    payload: row.payload ?? {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
