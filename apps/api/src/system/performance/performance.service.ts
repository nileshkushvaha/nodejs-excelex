import { Inject, Injectable, OnModuleInit } from "@nestjs/common";

import { ENVIRONMENT, type Environment } from "../../core/config/environment";
import { PrismaService } from "../../core/database/prisma.service";
import { MetricsService } from "../../core/metrics/metrics.service";
import type { RouteStat, WindowMinutes } from "../../core/metrics/rolling-window";
import { RedisService } from "../../core/redis/redis.service";
import { QUEUES, type QueueName } from "../../jobs/job.types";
import { QueueService } from "../../jobs/queue.service";

/**
 * Assembles the performance screen from the metrics service and the live
 * dependencies.
 *
 * The metrics service knows what this process did; this service adds what
 * the process is attached to — a timed round trip to Postgres and Redis, the
 * queue depths, whether the workers and the scheduler are running here — and
 * hands the controller one document. It also wires the queue-depth source
 * into the Prometheus gauge, because this is the first module that can see
 * both the queue and the registry without either importing the other.
 */
export interface HealthCheck {
  name: string;
  ok: boolean;
  ms: number | null;
  detail: string;
}

@Injectable()
export class PerformanceService implements OnModuleInit {
  constructor(
    @Inject(ENVIRONMENT) private readonly environment: Environment,
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly queues: QueueService,
  ) {}

  onModuleInit(): void {
    this.metrics.registerQueueDepthSource(async () => {
      const depths = await this.queueDepths();
      // `paused` is a flag, not a depth, so only the numeric states are reported.
      return depths.map(({ queue, ...rest }) => ({
        queue,
        counts: Object.fromEntries(
          Object.entries(rest as Record<string, unknown>).filter(
            (entry): entry is [string, number] => typeof entry[1] === "number",
          ),
        ),
      }));
    });
  }

  private async queueDepths() {
    return Promise.all(Object.values(QUEUES).map((name) => this.queues.depth(name as QueueName)));
  }

  private async databasePing(): Promise<{ ok: boolean; pingMs: number | null }> {
    const started = process.hrtime.bigint();
    try {
      await this.prisma.platform.$queryRaw`SELECT 1`;
      return { ok: true, pingMs: Number(process.hrtime.bigint() - started) / 1_000_000 };
    } catch {
      return { ok: false, pingMs: null };
    }
  }

  private async schedulerLeader(): Promise<string | null> {
    try {
      return await this.redis.connection.get(this.redis.key("scheduler", "lease"));
    } catch {
      return null;
    }
  }

  async overview(window: WindowMinutes) {
    const [database, redisPing, queues] = await Promise.all([
      this.databasePing(),
      this.redis.pingMs(),
      this.queueDepths().catch(() => []),
    ]);

    const now = new Date();
    return {
      instance: this.metrics.instanceId,
      process: this.metrics.process(),
      eventLoop: this.metrics.eventLoop(),
      memory: this.metrics.process().memory,
      cpu: { percent: this.metrics.cpu() },
      inFlight: this.metrics.inFlight,
      http: this.metrics.http(window),
      db: this.metrics.db(window),
      redis: { pingMs: redisPing, ok: redisPing !== null },
      database,
      queues,
      jobs: this.metrics.jobs(60),
      since: new Date(now.getTime() - window * 60_000).toISOString(),
      generatedAt: now.toISOString(),
      // One process, one set of figures. Said here so the screen can say it too.
      scope: "instance" as const,
    };
  }

  routes(window: WindowMinutes, sort: "p95" | "count" | "errors"): RouteStat[] {
    const rows = this.metrics.routes(window);
    const by: Record<typeof sort, (a: RouteStat, b: RouteStat) => number> = {
      p95: (a, b) => b.p95 - a.p95,
      count: (a, b) => b.count - a.count,
      errors: (a, b) => b.errors - a.errors || b.errorRate - a.errorRate,
    };
    return rows.sort(by[sort]);
  }

  recentErrors(limit: number) {
    return this.metrics.recentServerErrors(limit);
  }

  async health() {
    const [database, redisPing, leader] = await Promise.all([
      this.databasePing(),
      this.redis.pingMs(),
      this.schedulerLeader(),
    ]);

    const checks: HealthCheck[] = [
      {
        name: "database",
        ok: database.ok,
        ms: database.pingMs,
        detail: database.ok ? "SELECT 1 answered" : "The database did not answer.",
      },
      {
        name: "redis",
        ok: redisPing !== null,
        ms: redisPing,
        detail: redisPing !== null ? "PING answered" : "Redis did not answer.",
      },
      {
        name: "workers",
        ok: this.environment.RUN_WORKERS,
        ms: null,
        detail: this.environment.RUN_WORKERS
          ? "Queue workers run in this process."
          : "RUN_WORKERS is off here; another process must run the queues.",
      },
      {
        name: "scheduler",
        ok: leader !== null,
        ms: null,
        detail: leader ? `Lease held by ${leader}.` : "No scheduler holds the lease right now.",
      },
    ];

    return {
      ok: checks.every((check) => check.ok || check.name === "workers" || check.name === "scheduler"),
      checks,
      instance: this.metrics.instanceId,
      metricsPath: "/api/metrics",
      metricsProtected: this.metrics.metricsProtected,
      generatedAt: new Date().toISOString(),
    };
  }
}
