import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { Worker, type Job as BullJob } from "bullmq";

import { ENVIRONMENT, type Environment } from "../core/config/environment";
import { PrismaService } from "../core/database/prisma.service";
import { QUEUES, type JobEnvelope, type QueueName } from "./job.types";
import { QueueService } from "./queue.service";
import { JobRegistry } from "./job.registry";

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
  ) {}

  onApplicationBootstrap(): void {
    if (!this.environment.RUN_WORKERS) {
      this.logger.log("Workers disabled in this process (RUN_WORKERS=false).");
      return;
    }

    for (const [name, concurrency] of [
      [QUEUES.DEFAULT, 5],
      [QUEUES.BULK, 2],
      [QUEUES.SCHEDULED, 2],
    ] as Array<[QueueName, number]>) {
      const worker = new Worker(
        name,
        async (job) => this.run(job as BullJob<JobEnvelope>),
        {
          connection: this.queues.redis,
          prefix: this.queues.prefix,
          // Bulk work is deliberately the least concurrent: two large imports
          // at once is how a database runs out of connections.
          concurrency,
        },
      );

      worker.on("failed", (job, error) => {
        this.logger.error(`${job?.name} failed: ${error.message}`, error.stack);
      });

      this.workers.push(worker);
    }

    this.logger.log(`Workers running on ${this.workers.length} queues.`);
  }

  private async run(job: BullJob<JobEnvelope>): Promise<unknown> {
    const { clientId, jobId, payload, requestedById } = job.data;
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
        handler({ clientId, jobId, requestedById, payload }, tx),
      );

      await this.finish(clientId, jobId, {
        status: "SUCCEEDED",
        startedAt,
        result: (result ?? null) as never,
        attempts: job.attemptsMade + 1,
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
    },
  ): Promise<void> {
    const finishedAt = new Date();

    await this.prisma.forClient(clientId, async (tx) => {
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
