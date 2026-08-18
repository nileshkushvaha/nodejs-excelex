import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import IORedis from "ioredis";

import { ENVIRONMENT, type Environment } from "../config/environment";

/**
 * The one Redis connection everything shares, and the key prefix that keeps
 * two deployments on one Redis out of each other's way.
 *
 * Shared rather than one per consumer, because a queue, a cache and a
 * scheduler lease on three connections is three sockets to keep alive and
 * three ways for the pool to be exhausted. BullMQ's own workers duplicate the
 * connection when they need a blocking one; nothing else does.
 *
 * `maxRetriesPerRequest: null` is BullMQ's requirement — a blocking command
 * must not be retried by the client, or a worker can lose a job it had already
 * claimed — and it costs the cache nothing: a cache read that fails simply
 * misses.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly connection: IORedis;

  constructor(@Inject(ENVIRONMENT) private readonly environment: Environment) {
    this.connection = new IORedis(this.environment.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
    });
    this.connection.on("error", (error) => this.logger.error(`Redis: ${error.message}`));
  }

  /**
   * The namespace, e.g. `excelex:production`. Colon-joined by every consumer,
   * because that is the convention every Redis tool understands.
   */
  get prefix(): string {
    return `excelex:${this.environment.NODE_ENV}`;
  }

  key(...parts: string[]): string {
    return [this.prefix, ...parts].join(":");
  }

  /** Round trip in milliseconds, or null when Redis is unreachable. */
  async pingMs(): Promise<number | null> {
    const started = process.hrtime.bigint();
    try {
      await this.connection.ping();
      return Number(process.hrtime.bigint() - started) / 1_000_000;
    } catch {
      return null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection.quit().catch(() => undefined);
  }
}
