/**
 * The last hour of this process, in sixty one-minute buckets, held in memory.
 *
 * Prometheus is the right answer for fleet-wide, long-horizon questions, and
 * /metrics serves it. But the performance screen has to work on a laptop and
 * on a single-instance deployment with no Prometheus in sight, and it has to
 * answer "what has been slow in the last fifteen minutes" — which a counter
 * and a histogram cannot say without a query engine on top. So the same
 * observations are also written here, and this is what the screen reads.
 *
 * Bounded by construction. Sixty buckets, a capped number of routes, and a
 * reservoir of at most two hundred durations per aggregate: a burst of a
 * million requests costs the same memory as a quiet minute. Percentiles are
 * computed from the merged reservoirs at read time, which is exact for small
 * counts and an unbiased sample for large ones — good enough to tell 40 ms
 * from 400 ms, which is what a person looking at this screen needs.
 *
 * Route labels are patterns, never raw URLs, and are capped: past the cap
 * every new pattern is filed under "other". Otherwise a scanner walking ids
 * would grow this map without limit — the same reason Prometheus label
 * cardinality is a thing people are warned about.
 */

export const RESERVOIR_SIZE = 200;
export const MAX_ROUTES = 300;
export const SLOW_QUERY_MS = 500;
const MINUTES = 60;

export type WindowMinutes = 5 | 15 | 60;

interface Aggregate {
  count: number;
  errors4xx: number;
  errors5xx: number;
  sumMs: number;
  maxMs: number;
  /** How many durations were offered, so the reservoir stays uniform. */
  seen: number;
  samples: number[];
}

interface RouteAggregate extends Aggregate {
  route: string;
  method: string;
}

interface ModelAggregate extends Aggregate {
  model: string;
  operations: Record<string, number>;
  slowCount: number;
}

interface JobAggregate extends Aggregate {
  succeeded: number;
  failed: number;
}

interface Bucket {
  minute: number;
  http: Aggregate;
  byRoute: Map<string, RouteAggregate>;
  byModel: Map<string, ModelAggregate>;
  db: Aggregate;
  jobs: JobAggregate;
}

export interface RouteStat {
  route: string;
  method: string;
  count: number;
  errors: number;
  errorRate: number;
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  max: number;
}

export interface ModelStat {
  model: string;
  count: number;
  operations: Record<string, number>;
  p50: number;
  p95: number;
  totalMs: number;
  avg: number;
  slowCount: number;
}

export interface HttpSnapshot {
  windowMinutes: WindowMinutes;
  requests: number;
  rps: number;
  errors4xx: number;
  errors5xx: number;
  errorRate: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  avg: number;
  /** Top routes by p95, at most 25. */
  byRoute: RouteStat[];
  slowestByAvg: RouteStat[];
  mostErrors: RouteStat[];
  perMinute: Array<{ minute: string; count: number; errors: number; p95: number }>;
}

export interface DbSnapshot {
  queries: number;
  p50: number;
  p95: number;
  totalMs: number;
  slowCount: number;
  perModel: ModelStat[];
}

export interface JobsSnapshot {
  succeeded: number;
  failed: number;
  p95: number;
  avg: number;
}

function newAggregate(): Aggregate {
  return { count: 0, errors4xx: 0, errors5xx: 0, sumMs: 0, maxMs: 0, seen: 0, samples: [] };
}

function observe(agg: Aggregate, ms: number, status?: number): void {
  agg.count += 1;
  agg.sumMs += ms;
  if (ms > agg.maxMs) agg.maxMs = ms;
  if (status !== undefined) {
    if (status >= 500) agg.errors5xx += 1;
    else if (status >= 400) agg.errors4xx += 1;
  }
  // Algorithm R: every offered value has an equal chance of being kept.
  agg.seen += 1;
  if (agg.samples.length < RESERVOIR_SIZE) {
    agg.samples.push(ms);
  } else {
    const slot = Math.floor(Math.random() * agg.seen);
    if (slot < RESERVOIR_SIZE) agg.samples[slot] = ms;
  }
}

function merge(target: Aggregate, source: Aggregate): void {
  target.count += source.count;
  target.errors4xx += source.errors4xx;
  target.errors5xx += source.errors5xx;
  target.sumMs += source.sumMs;
  if (source.maxMs > target.maxMs) target.maxMs = source.maxMs;
  target.seen += source.seen;
  // Merged reservoirs are concatenated rather than re-sampled: at most
  // 60 × 200 numbers per aggregate, sorted once per snapshot. Cheap.
  for (const sample of source.samples) target.samples.push(sample);
}

/** Nearest-rank percentile over a sorted array; 0 when there is nothing. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)] ?? 0;
}

function summarise(agg: Aggregate): { p50: number; p95: number; p99: number; avg: number } {
  const sorted = [...agg.samples].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    avg: agg.count === 0 ? 0 : agg.sumMs / agg.count,
  };
}

export class RollingWindow {
  private readonly buckets: Array<Bucket | undefined> = new Array<Bucket | undefined>(MINUTES);
  private readonly knownRoutes = new Set<string>();

  constructor(private readonly now: () => number = Date.now) {}

  /** The bucket for the current minute, evicting whatever an hour-old bucket held. */
  private current(): Bucket {
    const minute = Math.floor(this.now() / 60_000);
    const slot = minute % MINUTES;
    let bucket = this.buckets[slot];
    if (!bucket || bucket.minute !== minute) {
      bucket = {
        minute,
        http: newAggregate(),
        byRoute: new Map(),
        byModel: new Map(),
        db: newAggregate(),
        jobs: { ...newAggregate(), succeeded: 0, failed: 0 },
      };
      this.buckets[slot] = bucket;
    }
    return bucket;
  }

  /** Buckets inside the window, oldest first, including empty minutes as undefined. */
  private recent(minutes: WindowMinutes): Array<{ minute: number; bucket: Bucket | undefined }> {
    const nowMinute = Math.floor(this.now() / 60_000);
    const out: Array<{ minute: number; bucket: Bucket | undefined }> = [];
    for (let back = minutes - 1; back >= 0; back -= 1) {
      const minute = nowMinute - back;
      const bucket = this.buckets[minute % MINUTES];
      out.push({ minute, bucket: bucket && bucket.minute === minute ? bucket : undefined });
    }
    return out;
  }

  /**
   * The label a route is filed under. Past the cardinality cap a new pattern
   * becomes "other" — an already-known one keeps its own row, so a scanner
   * cannot push the real routes out of the table.
   */
  routeLabel(route: string): string {
    if (this.knownRoutes.has(route)) return route;
    if (this.knownRoutes.size >= MAX_ROUTES) return "other";
    this.knownRoutes.add(route);
    return route;
  }

  observeRequest(input: {
    method: string;
    route: string;
    status: number;
    durationMs: number;
  }): void {
    const bucket = this.current();
    const route = this.routeLabel(input.route);
    observe(bucket.http, input.durationMs, input.status);

    const key = `${input.method} ${route}`;
    let agg = bucket.byRoute.get(key);
    if (!agg) {
      agg = { ...newAggregate(), route, method: input.method };
      bucket.byRoute.set(key, agg);
    }
    observe(agg, input.durationMs, input.status);
  }

  observeQuery(model: string, operation: string, durationMs: number): void {
    const bucket = this.current();
    observe(bucket.db, durationMs);
    let agg = bucket.byModel.get(model);
    if (!agg) {
      agg = { ...newAggregate(), model, operations: {}, slowCount: 0 };
      bucket.byModel.set(model, agg);
    }
    observe(agg, durationMs);
    agg.operations[operation] = (agg.operations[operation] ?? 0) + 1;
    if (durationMs > SLOW_QUERY_MS) agg.slowCount += 1;
  }

  observeJob(status: "succeeded" | "failed", durationMs: number): void {
    const bucket = this.current();
    observe(bucket.jobs, durationMs);
    if (status === "succeeded") bucket.jobs.succeeded += 1;
    else bucket.jobs.failed += 1;
  }

  snapshotHttp(minutes: WindowMinutes): HttpSnapshot {
    const total = newAggregate();
    const routes = new Map<string, RouteAggregate>();
    const perMinute: HttpSnapshot["perMinute"] = [];

    for (const { minute, bucket } of this.recent(minutes)) {
      if (bucket) {
        merge(total, bucket.http);
        for (const [key, agg] of bucket.byRoute) {
          let target = routes.get(key);
          if (!target) {
            target = { ...newAggregate(), route: agg.route, method: agg.method };
            routes.set(key, target);
          }
          merge(target, agg);
        }
      }
      const summary = bucket ? summarise(bucket.http) : { p95: 0 };
      perMinute.push({
        minute: new Date(minute * 60_000).toISOString(),
        count: bucket?.http.count ?? 0,
        errors: bucket ? bucket.http.errors4xx + bucket.http.errors5xx : 0,
        p95: summary.p95,
      });
    }

    const routeStats: RouteStat[] = [...routes.values()].map((agg) => {
      const summary = summarise(agg);
      const errors = agg.errors4xx + agg.errors5xx;
      return {
        route: agg.route,
        method: agg.method,
        count: agg.count,
        errors,
        errorRate: agg.count === 0 ? 0 : errors / agg.count,
        max: agg.maxMs,
        ...summary,
      };
    });

    const summary = summarise(total);
    const errors = total.errors4xx + total.errors5xx;

    return {
      windowMinutes: minutes,
      requests: total.count,
      rps: total.count / (minutes * 60),
      errors4xx: total.errors4xx,
      errors5xx: total.errors5xx,
      errorRate: total.count === 0 ? 0 : errors / total.count,
      max: total.maxMs,
      ...summary,
      byRoute: [...routeStats].sort((a, b) => b.p95 - a.p95).slice(0, 25),
      slowestByAvg: [...routeStats].sort((a, b) => b.avg - a.avg).slice(0, 10),
      mostErrors: routeStats
        .filter((r) => r.errors > 0)
        .sort((a, b) => b.errors - a.errors || b.errorRate - a.errorRate)
        .slice(0, 10),
      perMinute,
    };
  }

  /** Every route in the window, unsorted; the caller sorts. */
  allRoutes(minutes: WindowMinutes): RouteStat[] {
    const routes = new Map<string, RouteAggregate>();
    for (const { bucket } of this.recent(minutes)) {
      if (!bucket) continue;
      for (const [key, agg] of bucket.byRoute) {
        let target = routes.get(key);
        if (!target) {
          target = { ...newAggregate(), route: agg.route, method: agg.method };
          routes.set(key, target);
        }
        merge(target, agg);
      }
    }
    return [...routes.values()].map((agg) => {
      const errors = agg.errors4xx + agg.errors5xx;
      return {
        route: agg.route,
        method: agg.method,
        count: agg.count,
        errors,
        errorRate: agg.count === 0 ? 0 : errors / agg.count,
        max: agg.maxMs,
        ...summarise(agg),
      };
    });
  }

  snapshotDb(minutes: WindowMinutes, topModels = 15): DbSnapshot {
    const total = newAggregate();
    const models = new Map<string, ModelAggregate>();
    let slowCount = 0;

    for (const { bucket } of this.recent(minutes)) {
      if (!bucket) continue;
      merge(total, bucket.db);
      for (const [model, agg] of bucket.byModel) {
        let target = models.get(model);
        if (!target) {
          target = { ...newAggregate(), model, operations: {}, slowCount: 0 };
          models.set(model, target);
        }
        merge(target, agg);
        target.slowCount += agg.slowCount;
        slowCount += agg.slowCount;
        for (const [operation, count] of Object.entries(agg.operations)) {
          target.operations[operation] = (target.operations[operation] ?? 0) + count;
        }
      }
    }

    const summary = summarise(total);
    return {
      queries: total.count,
      p50: summary.p50,
      p95: summary.p95,
      totalMs: total.sumMs,
      slowCount,
      perModel: [...models.values()]
        .map((agg) => {
          const s = summarise(agg);
          return {
            model: agg.model,
            count: agg.count,
            operations: agg.operations,
            p50: s.p50,
            p95: s.p95,
            avg: s.avg,
            totalMs: agg.sumMs,
            slowCount: agg.slowCount,
          };
        })
        .sort((a, b) => b.totalMs - a.totalMs)
        .slice(0, topModels),
    };
  }

  snapshotJobs(minutes: WindowMinutes): JobsSnapshot {
    const total: JobAggregate = { ...newAggregate(), succeeded: 0, failed: 0 };
    for (const { bucket } of this.recent(minutes)) {
      if (!bucket) continue;
      merge(total, bucket.jobs);
      total.succeeded += bucket.jobs.succeeded;
      total.failed += bucket.jobs.failed;
    }
    const summary = summarise(total);
    return { succeeded: total.succeeded, failed: total.failed, p95: summary.p95, avg: summary.avg };
  }
}
