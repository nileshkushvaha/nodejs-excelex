import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@excelex/database";

import { requireRequestContext } from "../../core/context/request-context";
import { PrismaService } from "../../core/database/prisma.service";
import { JobRegistry } from "../../jobs/job.registry";
import { QUEUES, type QueueName } from "../../jobs/job.types";
import { QueueService } from "../../jobs/queue.service";
import { WORKER_CONCURRENCY } from "../../jobs/worker.service";

export interface QueueWindowStats {
  queue: string;
  /** Null for the queue-level row; the job name for a per-name row. */
  name: string | null;
  succeeded: number;
  failed: number;
  cancelled: number;
  avgMs: number | null;
  p95Ms: number | null;
}

/**
 * The monitor's two halves, and the platform-wide actions.
 *
 * Live counts come from Redis and are the same for every client, because the
 * queue is one queue: Redis is not client-scoped, and a job from any client
 * waits in the same list. Statistics come from Postgres under the client's
 * own row-level security, so the summary a client sees is of its own work.
 *
 * Pause, resume and clean act on Redis and therefore on every client at
 * once. That is stated in the doc comment on each, in the audit metadata,
 * and in the UI copy, because an administrator pausing "their" bulk queue
 * is pausing everyone's, and should know it before rather than after.
 */
@Injectable()
export class QueueMonitorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    private readonly registry: JobRegistry,
  ) {}

  /** Live Redis counts per queue, with what runs them. */
  async live() {
    const depths = await Promise.all(Object.values(QUEUES).map((name) => this.queues.depth(name)));
    return {
      queues: depths.map((depth) => ({ ...depth, concurrency: WORKER_CONCURRENCY[depth.queue] })),
      handlers: this.registry.names(),
      concurrency: WORKER_CONCURRENCY,
    };
  }

  /**
   * What happened, from Postgres, for the requesting client.
   *
   * Percentiles in SQL rather than in the process: a week of a busy client's
   * jobs is far more rows than it is worth pulling over the wire to sort.
   * GROUPING SETS gives the per-queue and per-name rows from one scan.
   */
  async summary() {
    const { clientId } = requireRequestContext();
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 3_600_000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 3_600_000);

    return this.prisma.forClient(clientId!, async (tx) => {
      const [last24h, last7d, hourly, oldest] = await Promise.all([
        tx.$queryRaw<RawWindowRow[]>(windowSql(dayAgo)),
        tx.$queryRaw<RawWindowRow[]>(windowSql(weekAgo)),
        tx.$queryRaw<RawHourRow[]>(Prisma.sql`
          SELECT queue,
                 date_trunc('hour', finished_at) AS hour,
                 count(*) FILTER (WHERE status = 'SUCCEEDED')::int AS succeeded,
                 count(*) FILTER (WHERE status = 'FAILED')::int AS failed
          FROM jobs
          WHERE finished_at >= ${dayAgo}
          GROUP BY queue, date_trunc('hour', finished_at)
        `),
        tx.$queryRaw<RawOldestRow[]>(Prisma.sql`
          SELECT queue, min(created_at) AS oldest
          FROM jobs
          WHERE status = 'QUEUED' AND (scheduled_for IS NULL OR scheduled_for <= now())
          GROUP BY queue
        `),
      ]);

      // Twenty-four buckets per queue, zero-filled, oldest first — the shape
      // a sparkline wants, so the page does not have to align hours itself.
      const buckets: string[] = [];
      const start = new Date(now);
      start.setUTCMinutes(0, 0, 0);
      for (let index = 23; index >= 0; index -= 1) {
        buckets.push(new Date(start.getTime() - index * 3_600_000).toISOString());
      }

      const throughput = Object.values(QUEUES).map((queue) => {
        const byHour = new Map<string, { succeeded: number; failed: number }>();
        for (const row of hourly) {
          if (row.queue !== queue) continue;
          byHour.set(new Date(row.hour).toISOString(), { succeeded: row.succeeded, failed: row.failed });
        }
        return {
          queue,
          hours: buckets.map((hour) => ({ hour, ...(byHour.get(hour) ?? { succeeded: 0, failed: 0 }) })),
        };
      });

      const oldestWaiting = Object.fromEntries(
        Object.values(QUEUES).map((queue) => {
          const row = oldest.find((entry) => entry.queue === queue);
          return [
            queue,
            row ? { since: new Date(row.oldest).toISOString(), ageMs: now.getTime() - new Date(row.oldest).getTime() } : null,
          ];
        }),
      );

      return {
        generatedAt: now.toISOString(),
        last24h: last24h.map(toWindowStats),
        last7d: last7d.map(toWindowStats),
        throughput,
        oldestWaiting,
      };
    });
  }

  /** Platform-wide: stops workers on every deployment taking new jobs from this queue. */
  async pause(name: string) {
    const queue = this.requireQueue(name);
    await this.queues.queue(queue).pause();
    await this.audit("system.queue.paused", queue, { queue, scope: "platform" });
    return { queue, paused: true };
  }

  /** Platform-wide: the reverse of pause. */
  async resume(name: string) {
    const queue = this.requireQueue(name);
    await this.queues.queue(queue).resume();
    await this.audit("system.queue.resumed", queue, { queue, scope: "platform" });
    return { queue, paused: false };
  }

  /**
   * Platform-wide: drops finished BullMQ records older than the given age from
   * Redis. The Postgres history is untouched — this is housekeeping for the
   * live view, not deletion of the record.
   */
  async clean(name: string, state: "completed" | "failed", olderThanMinutes: number) {
    const queue = this.requireQueue(name);
    const removed = await this.queues.queue(queue).clean(olderThanMinutes * 60_000, 1_000, state);
    await this.audit("system.queue.cleaned", queue, {
      queue,
      state,
      olderThanMinutes,
      removed: removed.length,
      scope: "platform",
    });
    return { queue, state, removed: removed.length };
  }

  private requireQueue(name: string): QueueName {
    const known = Object.values(QUEUES) as string[];
    if (!known.includes(name)) {
      throw new BadRequestException(`Unknown queue "${name}". Known queues: ${known.join(", ")}.`);
    }
    return name as QueueName;
  }

  private async audit(action: string, queue: string, metadata: Record<string, unknown>) {
    const { clientId, actor, ip, userAgent } = requireRequestContext();
    await this.prisma.forClient(clientId!, async (tx) => {
      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action,
          entity: "queue",
          entityId: null,
          metadata: { ...metadata, note: "Affects every account on this deployment.", queueName: queue },
          ip,
          userAgent,
        },
      });
    });
  }
}

interface RawWindowRow {
  queue: string;
  name: string | null;
  succeeded: number;
  failed: number;
  cancelled: number;
  avg_ms: number | null;
  p95_ms: number | null;
}

interface RawHourRow {
  queue: string;
  hour: Date;
  succeeded: number;
  failed: number;
}

interface RawOldestRow {
  queue: string;
  oldest: Date;
}

function windowSql(since: Date) {
  return Prisma.sql`
    SELECT queue,
           name,
           count(*) FILTER (WHERE status = 'SUCCEEDED')::int AS succeeded,
           count(*) FILTER (WHERE status = 'FAILED')::int AS failed,
           count(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled,
           avg(duration_ms) FILTER (WHERE status = 'SUCCEEDED')::float AS avg_ms,
           (percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)
              FILTER (WHERE status = 'SUCCEEDED' AND duration_ms IS NOT NULL))::float AS p95_ms
    FROM jobs
    WHERE finished_at >= ${since}
    GROUP BY GROUPING SETS ((queue, name), (queue))
    ORDER BY queue, name NULLS FIRST
  `;
}

function toWindowStats(row: RawWindowRow): QueueWindowStats {
  return {
    queue: row.queue,
    name: row.name,
    succeeded: Number(row.succeeded),
    failed: Number(row.failed),
    cancelled: Number(row.cancelled),
    avgMs: row.avg_ms === null ? null : Math.round(Number(row.avg_ms)),
    p95Ms: row.p95_ms === null ? null : Math.round(Number(row.p95_ms)),
  };
}
