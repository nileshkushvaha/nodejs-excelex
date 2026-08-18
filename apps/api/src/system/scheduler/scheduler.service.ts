import { randomUUID } from "node:crypto";

import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";

import { ENVIRONMENT, type Environment } from "../../core/config/environment";
import { PrismaService } from "../../core/database/prisma.service";
import { NotificationService } from "../../core/notifications/notification.service";
import { ErrorReporter } from "../../core/observability/error-reporter";
import { ExceptionRecorder } from "../../core/observability/exception-recorder";
import { DefaultSchedulesService } from "./default-schedules.service";
import { logEvent } from "../../core/observability/log-event";
import { RedisService } from "../../core/redis/redis.service";
import type { JobName, QueueName } from "../../jobs/job.types";
import { QueueService } from "../../jobs/queue.service";
import { computeNextRun } from "./schedule.service";

/** How often the dispatcher looks for due schedules. */
export const TICK_MS = 30_000;
/** How long one process holds the right to dispatch. Shorter than a tick, so a dead leader is replaced by the next tick. */
const LEASE_MS = 25_000;
/** How many due schedules one tick will dispatch. The rest wait thirty seconds; a backlog is not a reason to enqueue thousands at once. */
const BATCH = 100;

/**
 * The dispatcher: turns schedules into jobs, once each.
 *
 * Two guarantees, from two mechanisms. A Redis lease (SET NX PX) means only
 * one process is dispatching at a time, so a deployment with three API pods
 * does not fire a nightly job three times. And each schedule is claimed with
 * a conditional update — "move nextRunAt forward, if it is still what I read"
 * — so that even if two dispatchers ever overlap (a lease that expired under
 * a slow tick), a schedule still fires once: the second claim matches zero
 * rows and skips.
 *
 * The scan is the one cross-client read in the system, through the jobs
 * handle whose role may see job_schedules for every client. Deliberately no
 * client-scope extension there: a dispatcher that could see only one client
 * would need to be told which, and there is nobody to tell it. Each job it
 * enqueues then carries its own client id, and runs sealed to that client
 * like any other.
 *
 * A bad schedule — an unknown job name, a cron that fails to compute — is
 * logged and skipped, not thrown. One client's mistake must not stop
 * another's nightly sweep.
 */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly instanceId = randomUUID();
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  lastTickAt: Date | null = null;
  isLeader = false;
  lastDispatched = 0;

  constructor(
    @Inject(ENVIRONMENT) private readonly environment: Environment,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly queues: QueueService,
    private readonly reporter: ErrorReporter,
    private readonly defaults: DefaultSchedulesService,
    private readonly notifications: NotificationService,
    private readonly recorder: ExceptionRecorder,
  ) {}

  get enabled(): boolean {
    return this.environment.RUN_SCHEDULER;
  }

  get nextTickAt(): Date | null {
    if (!this.timer || !this.lastTickAt) return null;
    return new Date(this.lastTickAt.getTime() + TICK_MS);
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) {
      this.logger.log("Scheduler disabled in this process (RUN_SCHEDULER=false).");
      return;
    }
    this.timer = setInterval(() => {
      void this.tickNow().catch((error: Error) =>
        logEvent(this.logger, "error", "scheduler.tick_failed", { message: error.message }, error.stack),
      );
    }, TICK_MS);
    // Unreferenced, so a process that is otherwise done (tests, a CLI) is
    // not kept alive by the dispatcher.
    this.timer.unref();
    this.lastTickAt = new Date();
    this.logger.log(`Scheduler running, ticking every ${TICK_MS / 1000}s.`);

    // Every client gets its defaults the first time a scheduler sees it —
    // at boot, and again every hour for clients provisioned since.
    void this.ensureDefaults();
    const hourly = setInterval(() => void this.ensureDefaults(), 60 * 60 * 1000);
    hourly.unref();
  }

  private async ensureDefaults(): Promise<void> {
    try {
      await this.defaults.ensureForAllClients();
    } catch (error) {
      logEvent(
        this.logger,
        "warn",
        "scheduler.defaults_failed",
        { message: error instanceof Error ? error.message : String(error) },
      );
    }
  }

  /** How many schedules are due right now. For the status card; not part of a tick. */
  async dueCount(): Promise<number> {
    return this.prisma.jobs.jobSchedule.count({
      where: { isActive: true, deletedAt: null, nextRunAt: { lte: new Date() } },
    });
  }

  /**
   * One pass. Public so a test can drive it and so an operator endpoint
   * could, without waiting for the interval. Returns how many jobs it
   * enqueued; zero when another process holds the lease.
   */
  async tickNow(): Promise<number> {
    // Two overlapping ticks in one process would both pass the lease (it is
    // ours either way), so overlap is refused here as well.
    if (this.ticking) return 0;
    this.ticking = true;
    try {
      const leased = await this.acquireLease();
      this.isLeader = leased;
      this.lastTickAt = new Date();
      if (!leased) return 0;

      const now = new Date();
      const due = await this.prisma.jobs.jobSchedule.findMany({
        where: { isActive: true, deletedAt: null, nextRunAt: { lte: now } },
        orderBy: { nextRunAt: "asc" },
        take: BATCH,
      });

      let dispatched = 0;
      for (const schedule of due) {
        try {
          if (await this.dispatch(schedule, now)) dispatched += 1;
        } catch (error) {
          void this.notifications.notify({
            clientId: schedule.clientId,
            permission: "system.schedule.view",
            kind: "schedule.dispatch_failed",
            severity: "WARNING",
            title: `Schedule could not run: ${schedule.name}`,
            body: `${schedule.name} (${schedule.jobName}) could not be dispatched: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
            href: "/system/scheduler",
            entity: { type: "job_schedule", id: schedule.id },
          });
          this.recorder.record({
            clientId: schedule.clientId,
            source: "scheduler",
            code: `schedule_dispatch_failed:${schedule.jobName}`,
            exception: error,
            route: schedule.jobName,
            context: { scheduleId: schedule.id, schedule: schedule.name },
          });
          this.reporter.captureException(error, {
            event: "scheduler.dispatch_failed",
            clientId: schedule.clientId,
            code: `schedule:${schedule.jobName}`,
            extra: { scheduleId: schedule.id, schedule: schedule.name },
          });
          logEvent(
            this.logger,
            "error",
            "scheduler.dispatch_failed",
            {
              scheduleId: schedule.id,
              schedule: schedule.name,
              clientId: schedule.clientId,
              message: error instanceof Error ? error.message : String(error),
            },
            error instanceof Error ? error.stack : undefined,
          );
        }
      }
      this.lastDispatched = dispatched;
      if (dispatched > 0) this.logger.log(`Dispatched ${dispatched} scheduled job(s).`);
      return dispatched;
    } finally {
      this.ticking = false;
    }
  }

  private async dispatch(
    schedule: {
      id: string;
      clientId: string;
      name: string;
      jobName: string;
      queue: string;
      cron: string;
      timezone: string;
      payload: unknown;
      nextRunAt: Date | null;
    },
    now: Date,
  ): Promise<boolean> {
    // The next fire time is computed from now, not from the missed time, so
    // a schedule that was down for a day fires once, not twenty-four times.
    const nextRunAt = computeNextRun(schedule.cron, schedule.timezone, now);

    const claimed = await this.prisma.jobs.jobSchedule.updateMany({
      where: { id: schedule.id, nextRunAt: schedule.nextRunAt },
      data: { nextRunAt, lastRunAt: now },
    });
    if (claimed.count === 0) return false;

    await this.queues.enqueue(
      schedule.jobName as JobName,
      (schedule.payload ?? {}) as Record<string, unknown>,
      {
        clientId: schedule.clientId,
        requestedById: null,
        queue: schedule.queue as QueueName,
        scheduleId: schedule.id,
      },
    );
    return true;
  }

  private async acquireLease(): Promise<boolean> {
    const key = this.redis.key("scheduler", "lease");
    const connection = this.redis.connection;
    // Renewed if we already hold it; taken if nobody does. A lease held by
    // another instance is left alone until it expires.
    const holder = await connection.get(key);
    if (holder === this.instanceId) {
      await connection.pexpire(key, LEASE_MS);
      return true;
    }
    const result = await connection.set(key, this.instanceId, "PX", LEASE_MS, "NX");
    return result === "OK";
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.isLeader) {
      // Released on the way out, so the next process does not wait a lease
      // length before it may dispatch.
      const key = this.redis.key("scheduler", "lease");
      const holder = await this.redis.connection.get(key).catch(() => null);
      if (holder === this.instanceId) await this.redis.connection.del(key).catch(() => undefined);
    }
  }
}
