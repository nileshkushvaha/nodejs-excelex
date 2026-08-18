import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";

import { ENVIRONMENT, type Environment } from "../core/config/environment";
import { requireRequestContext } from "../core/context/request-context";
import { PrismaService } from "../core/database/prisma.service";
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
  private readonly connection: IORedis;
  private readonly queues = new Map<string, Queue>();

  constructor(
    @Inject(ENVIRONMENT) private readonly environment: Environment,
    private readonly prisma: PrismaService,
  ) {
    this.connection = new IORedis(this.environment.REDIS_URL, {
      // BullMQ requires this: a blocking command must not be retried by the
      // client, or a worker can lose a job it had already claimed.
      maxRetriesPerRequest: null,
    });
  }

  /**
   * The Redis key namespace, so two deployments can share one Redis without
   * one draining the other's queue.
   *
   * BullMQ's own option, not baked into the queue name: it rejects a name
   * containing a colon, because it builds its keys by joining prefix and name
   * with one.
   */
  get prefix(): string {
    return `excelex:${this.environment.NODE_ENV}`;
  }

  get redis(): IORedis {
    return this.connection;
  }

  queue(name: QueueName): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection: this.connection, prefix: this.prefix });
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
    } = {},
  ): Promise<{ id: string }> {
    const context = options.clientId ? undefined : requireRequestContext();
    const clientId = options.clientId ?? context?.clientId;
    if (!clientId) throw new Error("A job must belong to a client.");

    const requestedById =
      options.requestedById === undefined ? (context?.actor?.userId ?? null) : options.requestedById;

    const queueName = options.queue ?? QUEUES.DEFAULT;
    const maxAttempts = options.maxAttempts ?? 3;

    const row = await this.prisma.forClient(clientId, async (tx) =>
      tx.job.create({
        data: {
          clientId,
          queue: queueName,
          name,
          payload: payload as never,
          maxAttempts,
          requestedById,
          scheduledFor: options.delayMs ? new Date(Date.now() + options.delayMs) : null,
        },
      }),
    );

    const jobOptions: JobsOptions = {
      attempts: maxAttempts,
      // Exponential, because the usual reason a job fails twice is that
      // something downstream is still down, and hammering it does not help.
      backoff: { type: "exponential", delay: 5_000 },
      ...(options.delayMs ? { delay: options.delayMs } : {}),
      // A window stays in Redis for the live view; Postgres holds the history.
      removeOnComplete: { age: 3_600, count: 1_000 },
      removeOnFail: { age: 86_400 },
    };

    await this.queue(queueName).add(name, { clientId, jobId: row.id, requestedById, payload }, jobOptions);

    this.logger.log(`Queued ${name} (${row.id}) on ${queueName}`);
    return { id: row.id };
  }

  /** Counts straight from Redis, for the live half of the monitor. */
  async depth(name: QueueName) {
    const counts = await this.queue(name).getJobCounts(
      "waiting",
      "active",
      "delayed",
      "failed",
      "completed",
    );
    return { queue: name, ...counts };
  }

  async onModuleDestroy(): Promise<void> {
    for (const queue of this.queues.values()) await queue.close();
    await this.connection.quit();
  }
}
