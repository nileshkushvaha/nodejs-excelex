import { cpus, hostname } from "node:os";
import { monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";

import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from "prom-client";

import { ENVIRONMENT, type Environment } from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import {
  RollingWindow,
  SLOW_QUERY_MS,
  type DbSnapshot,
  type HttpSnapshot,
  type JobsSnapshot,
  type RouteStat,
  type WindowMinutes,
} from "./rolling-window";

/**
 * Everything this process knows about how it is performing.
 *
 * Two audiences, one set of observations. Prometheus scrapes /metrics and
 * gets counters and histograms it can aggregate across every instance; the
 * performance screen reads the rolling window and gets "the last fifteen
 * minutes of this instance" with no scraper required. Both are fed from the
 * same three hooks — the HTTP middleware, the Prisma timing extension and the
 * job worker — so they can never disagree about what happened.
 *
 * Deliberately per-process. There is no cross-instance aggregation here and
 * the screen says so; that is Prometheus's job and pretending otherwise
 * would mean either a shared store on the request path or a number that
 * silently describes one server of several.
 *
 * Bounded memory: the window is a fixed ring, route labels are patterns
 * capped at 300, and prom-client's label sets are the same patterns.
 */
export interface QueueDepth {
  queue: string;
  counts: Record<string, number>;
}

export type QueueDepthSource = () => Promise<QueueDepth[]>;

/**
 * One failed request, as the performance screen shows it.
 *
 * Enough to find the log line (requestId), see the pattern (route, code) and
 * scope it (clientId) — and nothing that describes the inside: no message,
 * no stack. Those are in the log, keyed by the same requestId.
 */
export interface RecentError {
  readonly at: string;
  readonly requestId: string | null;
  readonly clientId: string | null;
  readonly method: string;
  readonly route: string;
  readonly status: number;
  readonly code: string;
}

const RECENT_ERRORS_MAX = 200;

const HTTP_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const DB_BUCKETS = [0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5];
const JOB_BUCKETS = [0.1, 0.5, 1, 5, 15, 30, 60, 300, 900];

@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetricsService.name);
  readonly registry = new Registry();
  readonly window = new RollingWindow();

  private readonly httpDuration: Histogram<"method" | "route" | "status_class">;
  private readonly httpTotal: Counter<"method" | "route" | "status">;
  private readonly httpInFlight: Gauge;
  private readonly dbDuration: Histogram<"model" | "operation">;
  private readonly jobDuration: Histogram<"queue" | "name" | "status">;
  private readonly errorsTotal: Counter<"code" | "status">;
  private readonly recentErrors: RecentError[] = [];

  private queueDepthSource: QueueDepthSource | undefined;
  private inFlightCount = 0;

  private readonly loopDelay: IntervalHistogram;
  private loopSample = { p50: 0, p99: 0, max: 0 };
  private loopTimer: NodeJS.Timeout | undefined;

  private lastCpu = process.cpuUsage();
  private lastCpuAt = process.hrtime.bigint();
  private cpuPercent = 0;

  readonly startedAt = new Date();
  readonly instanceId = `${hostname()}#${process.pid}`;

  constructor(
    @Inject(ENVIRONMENT) private readonly environment: Environment,
    private readonly prisma: PrismaService,
  ) {
    collectDefaultMetrics({ register: this.registry, prefix: "excelex_" });

    this.httpDuration = new Histogram({
      name: "excelex_http_request_duration_seconds",
      help: "HTTP request duration by route pattern.",
      labelNames: ["method", "route", "status_class"],
      buckets: HTTP_BUCKETS,
      registers: [this.registry],
    });
    this.httpTotal = new Counter({
      name: "excelex_http_requests_total",
      help: "HTTP requests by route pattern and status.",
      labelNames: ["method", "route", "status"],
      registers: [this.registry],
    });
    this.httpInFlight = new Gauge({
      name: "excelex_http_requests_in_flight",
      help: "Requests currently being handled.",
      registers: [this.registry],
    });
    // By code, not just status: a spike of 503s says something is down, a
    // spike of `database_unavailable` says what. Route is deliberately not a
    // label here — it is on the request counter, and code × route × status
    // is the cardinality explosion Prometheus warns about.
    this.errorsTotal = new Counter({
      name: "excelex_http_errors_total",
      help: "Failed requests (4xx and 5xx) by error code and status.",
      labelNames: ["code", "status"],
      registers: [this.registry],
    });
    this.dbDuration = new Histogram({
      name: "excelex_db_query_duration_seconds",
      help: "Prisma operation duration by model and operation.",
      labelNames: ["model", "operation"],
      buckets: DB_BUCKETS,
      registers: [this.registry],
    });
    this.jobDuration = new Histogram({
      name: "excelex_job_duration_seconds",
      help: "Background job duration by queue, name and outcome.",
      labelNames: ["queue", "name", "status"],
      buckets: JOB_BUCKETS,
      registers: [this.registry],
    });

    // Refreshed on scrape rather than on a timer: a queue depth nobody is
    // reading is a Redis round-trip nobody needed.
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- prom-client binds `this` to the gauge inside collect()
    const service = this;
    new Gauge({
      name: "excelex_queue_depth",
      help: "Jobs per queue and state, read from Redis at scrape time.",
      labelNames: ["queue", "state"],
      registers: [this.registry],
      async collect() {
        if (!service.queueDepthSource) return;
        try {
          for (const depth of await service.queueDepthSource()) {
            for (const [state, count] of Object.entries(depth.counts)) {
              this.set({ queue: depth.queue, state }, count);
            }
          }
        } catch {
          // Redis down is reported by the health check, not by a failed scrape.
        }
      },
    });

    this.loopDelay = monitorEventLoopDelay({ resolution: 20 });
    this.loopDelay.enable();
  }

  onModuleInit(): void {
    this.prisma.setQueryObserver((info) =>
      this.observeQuery(info.model, info.operation, info.durationMs),
    );

    // Read and reset once a second, so the numbers describe the recent past
    // rather than the whole life of the process. unref'd: a metrics timer
    // must never be what keeps a test run or a shutdown alive.
    this.loopTimer = setInterval(() => this.sampleEventLoop(), 1_000);
    this.loopTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.loopTimer) clearInterval(this.loopTimer);
    this.loopDelay.disable();
    this.prisma.setQueryObserver(undefined);
  }

  private sampleEventLoop(): void {
    const toMs = (nanos: number) => (Number.isFinite(nanos) ? nanos / 1_000_000 : 0);
    this.loopSample = {
      p50: toMs(this.loopDelay.percentile(50)),
      p99: toMs(this.loopDelay.percentile(99)),
      max: toMs(this.loopDelay.max),
    };
    this.loopDelay.reset();
  }

  /** The queue module tells us how to read depths; nothing here imports it. */
  registerQueueDepthSource(source: QueueDepthSource): void {
    this.queueDepthSource = source;
  }

  // ── Observations ───────────────────────────────────────────────────

  requestStarted(): void {
    this.inFlightCount += 1;
    this.httpInFlight.set(this.inFlightCount);
  }

  observeRequest(input: {
    method: string;
    route: string;
    status: number;
    durationMs: number;
  }): void {
    this.inFlightCount = Math.max(0, this.inFlightCount - 1);
    this.httpInFlight.set(this.inFlightCount);

    const route = this.window.routeLabel(input.route);
    const seconds = input.durationMs / 1_000;
    const statusClass = `${Math.floor(input.status / 100)}xx`;
    this.httpDuration.observe({ method: input.method, route, status_class: statusClass }, seconds);
    this.httpTotal.inc({ method: input.method, route, status: String(input.status) });
    this.window.observeRequest({ ...input, route });
  }

  /** Called by the exception filter for every failed request. */
  observeError(entry: Omit<RecentError, "at">): void {
    this.errorsTotal.inc({ code: entry.code, status: String(entry.status) });
    // 4xx are the client's doing and are counted, not remembered: the ring is
    // for what an operator should look at, and a burst of 404s from a scanner
    // would push out the one 500 that mattered.
    if (entry.status < 500) return;
    this.recentErrors.push({ at: new Date().toISOString(), ...entry });
    if (this.recentErrors.length > RECENT_ERRORS_MAX) this.recentErrors.shift();
  }

  /** Newest first. */
  recentServerErrors(limit = 50): RecentError[] {
    return this.recentErrors.slice(-limit).reverse();
  }

  observeQuery(model: string, operation: string, durationMs: number): void {
    this.dbDuration.observe({ model, operation }, durationMs / 1_000);
    this.window.observeQuery(model, operation, durationMs);
    if (durationMs > SLOW_QUERY_MS) {
      // Model and operation only. The arguments are client data and do not
      // belong in a log line, however useful they would be.
      this.logger.warn(`Slow query: ${model}.${operation} took ${durationMs.toFixed(0)} ms`);
    }
  }

  observeJob(input: {
    queue: string;
    name: string;
    status: "succeeded" | "failed";
    durationMs: number;
  }): void {
    this.jobDuration.observe(
      { queue: input.queue, name: input.name, status: input.status },
      input.durationMs / 1_000,
    );
    this.window.observeJob(input.status, input.durationMs);
  }

  // ── Reads ──────────────────────────────────────────────────────────

  get inFlight(): number {
    return this.inFlightCount;
  }

  http(minutes: WindowMinutes): HttpSnapshot {
    return this.window.snapshotHttp(minutes);
  }

  routes(minutes: WindowMinutes): RouteStat[] {
    return this.window.allRoutes(minutes);
  }

  db(minutes: WindowMinutes): DbSnapshot {
    return this.window.snapshotDb(minutes);
  }

  jobs(minutes: WindowMinutes): JobsSnapshot {
    return this.window.snapshotJobs(minutes);
  }

  eventLoop(): { p50: number; p99: number; max: number } {
    return { ...this.loopSample };
  }

  /**
   * Process CPU as a percentage of one core since the previous read.
   *
   * A delta rather than a lifetime average, because "busy since Tuesday"
   * says nothing about now. Reads closer than a second apart reuse the last
   * figure, so two consumers polling together do not zero each other out.
   */
  cpu(): number {
    const now = process.hrtime.bigint();
    const elapsedMs = Number(now - this.lastCpuAt) / 1_000_000;
    if (elapsedMs < 1_000) return this.cpuPercent;

    const usage = process.cpuUsage(this.lastCpu);
    const busyMs = (usage.user + usage.system) / 1_000;
    this.cpuPercent = Math.min(100 * (busyMs / elapsedMs), 100 * Math.max(1, cpus().length));
    this.lastCpu = process.cpuUsage();
    this.lastCpuAt = now;
    return this.cpuPercent;
  }

  process(): {
    pid: number;
    node: string;
    uptimeSeconds: number;
    startedAt: string;
    activeHandles: number;
    activeRequests: number;
    memory: { rss: number; heapUsed: number; heapTotal: number; external: number };
  } {
    const memory = process.memoryUsage();
    const internals = process as unknown as {
      _getActiveHandles?: () => unknown[];
      _getActiveRequests?: () => unknown[];
      getActiveResourcesInfo?: () => string[];
    };
    return {
      pid: process.pid,
      node: process.version,
      uptimeSeconds: process.uptime(),
      startedAt: this.startedAt.toISOString(),
      activeHandles: internals._getActiveHandles?.().length ?? internals.getActiveResourcesInfo?.().length ?? 0,
      activeRequests: internals._getActiveRequests?.().length ?? 0,
      memory: {
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        external: memory.external,
      },
    };
  }

  /** The Prometheus exposition. */
  async exposition(): Promise<{ body: string; contentType: string }> {
    return { body: await this.registry.metrics(), contentType: this.registry.contentType };
  }

  get metricsProtected(): boolean {
    return Boolean(this.environment.METRICS_TOKEN);
  }
}
