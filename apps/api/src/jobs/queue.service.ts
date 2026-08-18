import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Queue, type JobsOptions } from "bullmq";
import type IORedis from "ioredis";

import { requireRequestContext } from "../core/context/request-context";
import { InvariantError } from "../core/errors/app-error";
import { PrismaService } from "../core/database/prisma.service";
import { RedisService } from "../core/redis/redis.service";
import { QUEUES, type JobName, type QueueName } from "./job.types";

/**
 * Enqueuing work.
 *
 * Two stores, on purpose. Redis holds the queue — claiming, retrying and
 * back-off are solved problems and BullMQ solves them. Postgres holds the
 * record, because Redis is allowed to be flushed and the question support
 * actually gets is "what happened to the import I ran last Tuesday".
 *
 * The row is written first. A job in Redis with no row would run invisibly; a
 * row with no Redis job shows as queued and never starts, which is at least a
 * visible failure somebody can retry.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queues = new Map<string, Queue>();

  constructor(
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * The Redis key namespace, so two deployments can share one Redis without
   * one draining the other's queue.
   *
   * BullMQ's own option, not baked into the queue name: it rejects a name
   * containing a colon, because it builds its keys by joining prefix and name
   * with one.
   */
  get prefix(): string {
    return this.redisService.key("queue");
  }

  get redis(): IORedis {
    return this.redisService.connection;
  }

  queue(name: QueueName): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection: this.redis, prefix: this.prefix });
      this.queues.set(name, queue);
    }
    return queue;
  }

  async enqueue(
    name: JobName,
    payload: Record<string, unknown>,
    options: {
      queue?: QueueName;
      delayMs?: number;
      maxAttempts?: number;
      clientId?: string;
      requestedById?: string | null;
      /** Set by the dispatcher, so the row and the envelope both name the schedule. */
      scheduleId?: string | null;
    } = {},
  ): Promise<{ id: string }> {
    const context = options.clientId ? undefined : requireRequestContext();
    const clientId = options.clientId ?? context?.clientId;
    if (!clientId) throw new InvariantError("job_without_client", "A job must belong to a client.");

    const requestedById =
      options.requestedById === undefined ? (context?.actor?.userId ?? null) : options.requestedById;

    const queueName = options.queue ?? QUEUES.DEFAULT;
    const maxAttempts = options.maxAttempts ?? 3;
    const scheduleId = options.scheduleId ?? null;

    const row = await this.prisma.forClient(clientId, async (tx) =>
      tx.job.create({
        data: {
          clientId,
          queue: queueName,
          name,
          payload: payload as never,
          maxAttempts,
          requestedById,
          scheduleId,
          scheduledFor: options.delayMs ? new Date(Date.now() + options.delayMs) : null,
        },
      }),
    );

    const jobOptions: JobsOptions = {
      // The BullMQ id is our row id, so the monitor can look a row's live
      // state up directly rather than scanning the queue for a matching
      // payload.
      jobId: row.id,
      attempts: maxAttempts,
      // Exponential, because the usual reason a job fails twice is that
      // something downstream is still down, and hammering it does not help.
      backoff: { type: "exponential", delay: 5_000 },
      ...(options.delayMs ? { delay: options.delayMs } : {}),
      // A window stays in Redis for the live view; Postgres holds the history.
      removeOnComplete: { age: 3_600, count: 1_000 },
      removeOnFail: { age: 86_400 },
    };

    await this.queue(queueName).add(
      name,
      { clientId, jobId: row.id, requestedById, scheduleId, payload },
      jobOptions,
    );

    this.logger.log(`Queued ${name} (${row.id}) on ${queueName}`);
    return { id: row.id };
  }

  /** Counts straight from Redis, for the live half of the monitor. */
  async depth(name: QueueName) {
    const queue = this.queue(name);
    const [counts, paused] = await Promise.all([
      queue.getJobCounts("waiting", "active", "delayed", "failed", "completed", "prioritized"),
      queue.isPaused(),
    ]);
    return { queue: name, ...counts, paused };
  }

  /**
   * The live BullMQ record for one of our rows, or null once it has left
   * Redis. Direct by id, because the id is ours (see enqueue).
   */
  async liveState(queueName: QueueName, id: string) {
    const job = await this.queue(queueName).getJob(id);
    if (!job) return null;
    const state = await job.getState();
    return {
      state,
      progress: job.progress,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason ?? null,
      processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : null,
      finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      delay: job.delay,
    };
  }

  /**
   * Removes a job that has not started. Returns false when it is not in Redis
   * or is past the point of removal; the caller decides what that means.
   */
  async removeIfWaiting(queueName: QueueName, id: string): Promise<"removed" | "running" | "gone"> {
    const job = await this.queue(queueName).getJob(id);
    if (!job) return "gone";
    const state = await job.getState();
    if (state === "active") return "running";
    if (state === "completed" || state === "failed") return "gone";
    await job.remove();
    return "removed";
  }

  async onModuleDestroy(): Promise<void> {
    // The connection itself belongs to RedisService and is closed there.
    for (const queue of this.queues.values()) await queue.close();
  }
}
