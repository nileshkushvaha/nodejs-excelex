import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { Worker, type Job as BullJob } from "bullmq";

import { ENVIRONMENT, type Environment } from "../core/config/environment";
import { PrismaService } from "../core/database/prisma.service";
import { NotificationService } from "../core/notifications/notification.service";
import { ErrorReporter } from "../core/observability/error-reporter";
import { logEvent } from "../core/observability/log-event";
import { MetricsService } from "../core/metrics/metrics.service";
import { QUEUES, type JobEnvelope, type QueueName } from "./job.types";
import { QueueService } from "./queue.service";
import { JobRegistry } from "./job.registry";

/**
 * How many jobs each queue runs at once in one worker process.
 *
 * Exported so the monitor can show it beside the live counts: a queue with
 * forty waiting and a concurrency of two is a different picture from forty
 * waiting and twenty.
 */
export const WORKER_CONCURRENCY: Readonly<Record<QueueName, number>> = {
  [QUEUES.DEFAULT]: 5,
  // Bulk work is deliberately the least concurrent: two large imports at
  // once is how a database runs out of connections.
  [QUEUES.BULK]: 2,
  [QUEUES.SCHEDULED]: 2,
};

/**
 * Running work, safely, outside a request.
 *
 * The important part is the first thing it does: seal the client context from
 * the envelope. A worker has no host header and no session, so nothing else
 * would establish which client's rows it may touch. With the context sealed,
 * the handler runs under exactly the same row-level security a request does —
 * which is the property that makes background work safe in a system where the
 * whole security model is per-client isolation.
 *
 * Every outcome is written to the jobs table, including failures, including
 * the stack. A failed import that says only "failed" costs somebody an hour.
 */
@Injectable()
export class WorkerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);
  private readonly workers: Worker[] = [];

  constructor(
    @Inject(ENVIRONMENT) private readonly environment: Environment,
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    private readonly registry: JobRegistry,
    private readonly reporter: ErrorReporter,
    private readonly notifications: NotificationService,
    private readonly metrics: MetricsService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.environment.RUN_WORKERS) {
      this.logger.log("Workers disabled in this process (RUN_WORKERS=false).");
      return;
    }

    for (const [name, concurrency] of Object.entries(WORKER_CONCURRENCY) as Array<
      [QueueName, number]
    >) {
      const worker = new Worker(
        name,
        async (job) => this.run(job as BullJob<JobEnvelope>),
        {
          connection: this.queues.redis,
          prefix: this.queues.prefix,
          concurrency,
        },
      );

      worker.on("failed", (job, error) => {
        logEvent(
          this.logger,
          "error",
          "job.failed",
          {
            queue: name,
            job: job?.name,
            jobId: job?.data?.jobId,
            clientId: job?.data?.clientId,
            attempt: job?.attemptsMade,
            message: error.message,
          },
          error.stack,
        );
        if (job) this.observe(name, job, "failed");
        // Reported on the last attempt only: a retry that succeeds was not
        // an incident, and the row records every attempt regardless.
        if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
          if (job.data?.clientId && job.name !== "mail.send") {
            // Mail failures are told to the mail administrators by MailService.
            void this.notifications.notify({
              clientId: job.data.clientId,
              permission: "system.queue.view",
              kind: "job.failed",
              severity: "WARNING",
              title: `Background job failed: ${job.name}`,
              body: `${job.name} on the ${name} queue failed after ${job.attemptsMade} attempt(s): ${error.message.split("\n")[0]}`,
              href: job.data.jobId ? `/system/queues?jobId=${job.data.jobId}` : "/system/queues",
              entity: job.data.jobId ? { type: "job", id: job.data.jobId } : undefined,
            });
          }
          this.reporter.captureException(error, {
            event: "job.failed",
            clientId: job.data?.clientId,
            code: `job:${job.name}`,
            extra: { queue: name, jobId: job.data?.jobId, attempts: job.attemptsMade },
          });
        }
      });
      worker.on("completed", (job) => this.observe(name, job, "succeeded"));

      this.workers.push(worker);
    }

    this.logger.log(`Workers running on ${this.workers.length} queues.`);
  }

  /** Duration from BullMQ's own timestamps, so the metric and the row agree. */
  private observe(queue: QueueName, job: BullJob, status: "succeeded" | "failed"): void {
    const durationMs =
      job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : 0;
    this.metrics.observeJob({ queue, name: job.name, status, durationMs });
  }

  private async run(job: BullJob<JobEnvelope>): Promise<unknown> {
    const { clientId, jobId, payload, requestedById } = job.data;
    const scheduleId = job.data.scheduleId ?? null;
    const handler = this.registry.handler(job.name);
    const startedAt = new Date();

    if (!handler) {
      // A job nobody can handle is recorded as failed rather than retried:
      // no amount of waiting will make an unknown name known.
      await this.finish(clientId, jobId, {
        status: "FAILED",
        startedAt,
        error: `No handler is registered for "${job.name}".`,
        attempts: job.attemptsMade,
        scheduleId,
      });
      throw new Error(`No handler for ${job.name}`);
    }

    await this.prisma.forClient(clientId, async (tx) => {
      await tx.job.update({
        where: { id: jobId },
        data: { status: "RUNNING", startedAt, attempts: job.attemptsMade + 1 },
      });
    });

    try {
      // The context is sealed here, so everything the handler touches is
      // scoped to this client by the same barrier a request uses.
      const result = await this.prisma.forClient(clientId, async (tx) =>
        handler({ clientId, jobId, requestedById, scheduleId, payload }, tx),
      );

      await this.finish(clientId, jobId, {
        status: "SUCCEEDED",
        startedAt,
        result: (result ?? null) as never,
        attempts: job.attemptsMade + 1,
        scheduleId,
      });

      return result;
    } catch (error) {
      const last = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

      await this.finish(clientId, jobId, {
        // Still queued if BullMQ will try again: the row should say what is
        // true, and "failed" on a job that is about to run again is not.
        status: last ? "FAILED" : "QUEUED",
        startedAt,
        error: error instanceof Error ? (error.stack ?? error.message) : String(error),
        attempts: job.attemptsMade + 1,
        scheduleId,
      });

      throw error;
    }
  }

  private async finish(
    clientId: string,
    jobId: string,
    data: {
      status: "SUCCEEDED" | "FAILED" | "QUEUED";
      startedAt: Date;
      attempts: number;
      error?: string;
      result?: never;
      scheduleId?: string | null;
    },
  ): Promise<void> {
    const finishedAt = new Date();

    await this.prisma.forClient(clientId, async (tx) => {
      // The schedule's last outcome is written in the same transaction as
      // the job's, so the scheduler screen never shows a run the job table
      // disagrees with. Only a final outcome counts: a retry still pending
      // is not a result.
      if (data.scheduleId && data.status !== "QUEUED") {
        await tx.jobSchedule.updateMany({
          where: { id: data.scheduleId },
          data: { lastStatus: data.status },
        });
      }

      await tx.job.update({
        where: { id: jobId },
        data: {
          status: data.status,
          // Written here as well as on RUNNING: the no-handler path never
          // marks the job running, and the timing constraint (finished
          // implies started) is right to refuse a finish with no start.
          startedAt: data.startedAt,
          attempts: data.attempts,
          error: data.error ?? null,
          result: data.result ?? undefined,
          ...(data.status === "QUEUED"
            ? {}
            : { finishedAt, durationMs: finishedAt.getTime() - data.startedAt.getTime() }),
        },
      });
    });
  }

  async onModuleDestroy(): Promise<void> {
    // Closed rather than killed, so a job in flight finishes and is not
    // claimed twice when this process comes back.
    await Promise.all(this.workers.map((worker) => worker.close()));
  }
}
