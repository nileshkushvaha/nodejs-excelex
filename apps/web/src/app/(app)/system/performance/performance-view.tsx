"use client";

import Link from "next/link";

import { MasterTable } from "@/components/master-table";
import { StatusPill, type PillTone } from "@/components/status-pill";
import type {
  PerformanceHealth,
  PerformanceModel,
  PerformanceOverview,
  PerformanceRoute,
} from "@/lib/api";

/**
 * The performance screen, laid out top-down in the order somebody on call
 * reads it: is anything down (health strip), is it slow or failing (tiles),
 * since when (chart), and where (tables).
 *
 * The thresholds that colour a figure are stated once, here, and are the
 * same ones an alert would use: a p95 over half a second is worth a look and
 * over a second and a half is a problem; an error rate over one percent is
 * worth a look and over five is a problem; an event loop stalling more than
 * fifty milliseconds is worth a look and more than two hundred is a problem.
 *
 * Every figure is for one API instance. Prometheus scrapes /api/metrics from
 * every instance and is where the fleet-wide picture lives; this screen says
 * so rather than pretending otherwise.
 */

const WINDOWS = [5, 15, 60] as const;

// ── Formatting ─────────────────────────────────────────────────────────

function ms(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value >= 10_000) return `${(value / 1_000).toFixed(1)} s`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)} s`;
  if (value >= 100) return `${value.toFixed(0)} ms`;
  return `${value.toFixed(1)} ms`;
}

function bytes(value: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  let size = value;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function percent(rate: number, decimals = 1): string {
  return `${(rate * 100).toFixed(decimals)}%`;
}

function uptime(seconds: number): string {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3_600);
  const m = Math.floor((seconds % 3_600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(seconds % 60)}s`;
}

function count(value: number): string {
  return value.toLocaleString("en-IN");
}

// ── Thresholds ─────────────────────────────────────────────────────────

function latencyTone(p95: number): PillTone {
  if (p95 > 1_500) return "red";
  if (p95 > 500) return "amber";
  return "green";
}

function errorTone(rate: number): PillTone {
  if (rate > 0.05) return "red";
  if (rate > 0.01) return "amber";
  return "green";
}

function loopTone(p99: number): PillTone {
  if (p99 > 200) return "red";
  if (p99 > 50) return "amber";
  return "green";
}

const TONE_TEXT: Record<PillTone, string> = {
  green: "text-emerald-600 dark:text-emerald-400",
  amber: "text-amber-600 dark:text-amber-400",
  red: "text-red-600 dark:text-red-400",
  slate: "text-fg",
};

// ── Pieces ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  hint,
  tone = "slate",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: PillTone;
}) {
  return (
    <div className="card card-interactive group relative overflow-hidden rounded-xl p-4">
      <span
        aria-hidden="true"
        className="brand-gradient absolute inset-x-0 top-0 h-1 opacity-80 transition-opacity group-hover:opacity-100"
      />
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${TONE_TEXT[tone]}`}>{value}</p>
      <p className="mt-0.5 text-xs text-faint">{hint}</p>
    </div>
  );
}

function HealthStrip({ health }: { health: PerformanceHealth }) {
  const labels: Record<string, string> = {
    database: "Database",
    redis: "Redis",
    workers: "Workers",
    scheduler: "Scheduler",
  };
  return (
    <section className="card flex flex-wrap items-center gap-2 rounded-xl px-4 py-3">
      {health.checks.map((check) => {
        // Workers and the scheduler are allowed to live elsewhere; that is
        // "not here", not "broken", so it is grey rather than red.
        const optional = check.name === "workers" || check.name === "scheduler";
        const tone: PillTone = check.ok ? "green" : optional ? "slate" : "red";
        return (
          <StatusPill key={check.name} tone={tone} title={check.detail}>
            <span>{labels[check.name] ?? check.name}</span>
            <span className="tabular-nums opacity-80">
              {check.ms !== null ? ms(check.ms) : check.ok ? "on" : "off"}
            </span>
          </StatusPill>
        );
      })}
      <span className="ml-auto text-xs text-faint">
        instance <code className="font-mono">{health.instance}</code>
      </span>
    </section>
  );
}

function WindowSelector({ current }: { current: number }) {
  return (
    <div className="inline-flex rounded-lg border border-line p-0.5 text-xs">
      {WINDOWS.map((minutes) => (
        <Link
          key={minutes}
          href={`/system/performance?window=${minutes}`}
          scroll={false}
          className={`rounded-md px-2.5 py-1 tabular-nums transition-colors ${
            minutes === current ? "bg-surface-3 font-semibold text-fg" : "text-muted hover:text-fg"
          }`}
        >
          {minutes} min
        </Link>
      ))}
    </div>
  );
}

/**
 * Requests per minute as an area, p95 as a line on its own axis. Pure SVG,
 * responsive through viewBox; no charting library for two series.
 */
function TrafficChart({ points }: { points: PerformanceOverview["http"]["perMinute"] }) {
  const width = 720;
  const height = 180;
  const pad = { top: 12, right: 44, bottom: 22, left: 40 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const maxCount = Math.max(1, ...points.map((p) => p.count));
  const maxP95 = Math.max(1, ...points.map((p) => p.p95));
  const step = points.length > 1 ? innerW / (points.length - 1) : innerW;

  const x = (index: number) => pad.left + index * step;
  const yCount = (value: number) => pad.top + innerH - (value / maxCount) * innerH;
  const yP95 = (value: number) => pad.top + innerH - (value / maxP95) * innerH;

  const countLine = points.map((p, i) => `${x(i)},${yCount(p.count)}`).join(" ");
  const area = `M${x(0)},${yCount(0)} L${countLine.split(" ").join(" L")} L${x(points.length - 1)},${yCount(0)} Z`;
  const p95Line = points.map((p, i) => `${x(i)},${yP95(p.p95)}`).join(" ");

  const empty = points.every((p) => p.count === 0);
  const labelEvery = Math.max(1, Math.floor(points.length / 6));

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full min-w-[480px]"
        role="img"
        aria-label="Requests per minute with p95 latency overlay"
      >
        {[0, 0.5, 1].map((fraction) => (
          <line
            key={fraction}
            x1={pad.left}
            x2={width - pad.right}
            y1={pad.top + innerH * fraction}
            y2={pad.top + innerH * fraction}
            className="stroke-line"
            strokeDasharray="2 4"
          />
        ))}
        <path d={area} className="fill-blue-500/15" />
        <polyline points={countLine} fill="none" className="stroke-blue-500" strokeWidth={2} />
        <polyline
          points={p95Line}
          fill="none"
          className="stroke-amber-500"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        {points.map((p, i) =>
          p.errors > 0 ? (
            <circle key={p.minute} cx={x(i)} cy={yCount(p.count)} r={3} className="fill-red-500" />
          ) : null,
        )}
        {/* left axis: requests */}
        <text x={pad.left - 6} y={pad.top + 4} textAnchor="end" className="fill-current text-[10px] text-muted">
          {count(maxCount)}
        </text>
        <text x={pad.left - 6} y={pad.top + innerH} textAnchor="end" className="fill-current text-[10px] text-muted">
          0
        </text>
        {/* right axis: p95 */}
        <text x={width - pad.right + 6} y={pad.top + 4} className="fill-current text-[10px] text-muted">
          {ms(maxP95)}
        </text>
        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text
              key={`l${p.minute}`}
              x={x(i)}
              y={height - 6}
              textAnchor="middle"
              className="fill-current text-[10px] text-faint"
            >
              {new Date(p.minute).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}
            </text>
          ) : null,
        )}
        {empty ? (
          <text x={width / 2} y={height / 2} textAnchor="middle" className="fill-current text-xs text-muted">
            No requests in this window yet.
          </text>
        ) : null}
      </svg>
      <div className="mt-1 flex gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-blue-500" /> requests / min
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 border-t border-dashed border-amber-500" /> p95
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> minute with errors
        </span>
      </div>
    </div>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card rounded-xl">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      </div>
      <div className="p-2">{children}</div>
    </section>
  );
}

const routeColumns = [
  {
    header: "Route",
    cell: (row: PerformanceRoute) => <code className="font-mono text-xs">{row.route}</code>,
  },
  { header: "Method", cell: (row: PerformanceRoute) => <span className="text-xs">{row.method}</span> },
  { header: "Count", className: "text-right", cell: (row: PerformanceRoute) => <span className="tabular-nums">{count(row.count)}</span> },
  { header: "p50", className: "text-right", cell: (row: PerformanceRoute) => <span className="tabular-nums">{ms(row.p50)}</span> },
  {
    header: "p95",
    className: "text-right",
    cell: (row: PerformanceRoute) => (
      <span className={`tabular-nums ${TONE_TEXT[latencyTone(row.p95)]}`}>{ms(row.p95)}</span>
    ),
  },
  { header: "p99", className: "text-right", cell: (row: PerformanceRoute) => <span className="tabular-nums">{ms(row.p99)}</span> },
  {
    header: "Err %",
    className: "text-right",
    cell: (row: PerformanceRoute) => (
      <span className={`tabular-nums ${TONE_TEXT[errorTone(row.errorRate)]}`}>{percent(row.errorRate)}</span>
    ),
  },
];

const modelColumns = [
  { header: "Model", cell: (row: PerformanceModel) => <code className="font-mono text-xs">{row.model}</code> },
  {
    header: "Operations",
    cell: (row: PerformanceModel) => (
      <span className="text-xs text-muted">
        {Object.entries(row.operations)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([op, n]) => `${op} ×${n}`)
          .join(", ")}
      </span>
    ),
  },
  { header: "Count", className: "text-right", cell: (row: PerformanceModel) => <span className="tabular-nums">{count(row.count)}</span> },
  { header: "p95", className: "text-right", cell: (row: PerformanceModel) => <span className="tabular-nums">{ms(row.p95)}</span> },
  { header: "Total", className: "text-right", cell: (row: PerformanceModel) => <span className="tabular-nums">{ms(row.totalMs)}</span> },
  {
    header: "Slow",
    className: "text-right",
    cell: (row: PerformanceModel) => (
      <span className={`tabular-nums ${row.slowCount > 0 ? TONE_TEXT.amber : ""}`}>{row.slowCount}</span>
    ),
  },
];

// ── Screen ─────────────────────────────────────────────────────────────

export function PerformanceView({
  overview,
  health,
  window,
}: {
  overview: PerformanceOverview;
  health: PerformanceHealth;
  window: number;
}) {
  const { http, db, process: proc, eventLoop, memory, cpu } = overview;
  const heap = `${bytes(memory.heapUsed)} / ${bytes(memory.rss)}`;

  return (
    <div className="space-y-5">
      <HealthStrip health={health} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          Figures are for this API instance; Prometheus aggregates across instances via{" "}
          <code className="font-mono">{health.metricsPath}</code>. Window since{" "}
          {new Date(overview.since).toLocaleTimeString("en-IN", { hour12: false })}.
        </p>
        <WindowSelector current={window} />
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Requests / s" value={http.rps.toFixed(2)} hint={`${count(http.requests)} in ${window} min`} />
        <StatCard
          label="Error rate"
          value={percent(http.errorRate)}
          hint={`${http.errors4xx} × 4xx · ${http.errors5xx} × 5xx`}
          tone={errorTone(http.errorRate)}
        />
        <StatCard
          label="Latency p50 / p95 / p99"
          value={`${ms(http.p50)} · ${ms(http.p95)} · ${ms(http.p99)}`}
          hint={`max ${ms(http.max)}`}
          tone={latencyTone(http.p95)}
        />
        <StatCard label="In flight" value={String(overview.inFlight)} hint="requests being handled now" />
        <StatCard
          label="Event loop p99 lag"
          value={ms(eventLoop.p99)}
          hint={`p50 ${ms(eventLoop.p50)} · max ${ms(eventLoop.max)}`}
          tone={loopTone(eventLoop.p99)}
        />
        <StatCard label="Heap used / RSS" value={heap} hint={`heap total ${bytes(memory.heapTotal)}`} />
        <StatCard label="CPU" value={`${cpu.percent.toFixed(1)}%`} hint="of one core, since last read" />
        <StatCard label="Uptime" value={uptime(proc.uptimeSeconds)} hint={`Node ${proc.node} · pid ${proc.pid}`} />
        <StatCard
          label="Database"
          value={ms(overview.database.pingMs)}
          hint={`${count(db.queries)} queries · p95 ${ms(db.p95)}`}
          tone={overview.database.ok ? "slate" : "red"}
        />
        <StatCard
          label="Jobs (last hour)"
          value={`${overview.jobs.succeeded} ✓ · ${overview.jobs.failed} ✗`}
          hint={`p95 ${ms(overview.jobs.p95)}`}
          tone={overview.jobs.failed > 0 ? "amber" : "slate"}
        />
      </section>

      <Card title="Traffic" hint={`Requests per minute and p95 latency, last ${window} minutes.`}>
        <div className="px-2 py-2">
          <TrafficChart points={http.perMinute} />
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Slowest routes" hint="By p95, top 25. Route patterns, never URLs.">
          <MasterTable
            rows={http.byRoute}
            columns={routeColumns}
            empty="No requests in this window."
            rowKey={(row) => `${row.method} ${row.route}`}
            stickyLastColumn={false}
          />
        </Card>
        <Card title="Most errors" hint="Routes answering 4xx or 5xx, most first.">
          <MasterTable
            rows={http.mostErrors}
            columns={routeColumns}
            empty="No errors in this window."
            rowKey={(row) => `${row.method} ${row.route}`}
            stickyLastColumn={false}
          />
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card
            title="Database, per model"
            hint={`Top 15 by total time. ${db.slowCount} slow (>500 ms) in this window.`}
          >
            <MasterTable
              rows={db.perModel}
              columns={modelColumns}
              empty="No queries in this window."
              rowKey={(row) => row.model}
              stickyLastColumn={false}
            />
          </Card>
        </div>
        <div className="space-y-5">
          <Card title="Queues" hint="Live depths from Redis.">
            <MasterTable
              rows={overview.queues}
              columns={[
                {
                  header: "Queue",
                  cell: (row) => (
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <code className="font-mono">{row.queue}</code>
                      {row.paused ? <StatusPill tone="amber">paused</StatusPill> : null}
                    </span>
                  ),
                },
                { header: "Waiting", className: "text-right", cell: (row) => <span className="tabular-nums">{row.waiting ?? 0}</span> },
                { header: "Active", className: "text-right", cell: (row) => <span className="tabular-nums">{row.active ?? 0}</span> },
                { header: "Delayed", className: "text-right", cell: (row) => <span className="tabular-nums">{row.delayed ?? 0}</span> },
                {
                  header: "Failed",
                  className: "text-right",
                  cell: (row) => (
                    <span className={`tabular-nums ${(row.failed ?? 0) > 0 ? TONE_TEXT.red : ""}`}>{row.failed ?? 0}</span>
                  ),
                },
              ]}
              empty="No queues reported."
              rowKey={(row) => row.queue}
              stickyLastColumn={false}
            />
          </Card>

          <Card title="Prometheus">
            <div className="space-y-2 px-2 py-2 text-sm">
              <p className="text-fg">
                Scrape <code className="font-mono text-xs">GET {health.metricsPath}</code> on every
                instance.
              </p>
              <p className="flex items-center gap-2 text-xs text-muted">
                {health.metricsProtected ? (
                  <>
                    <StatusPill tone="green">token-protected</StatusPill>
                    Send <code className="font-mono">Authorization: Bearer &lt;METRICS_TOKEN&gt;</code>.
                  </>
                ) : (
                  <>
                    <StatusPill tone="amber">open</StatusPill>
                    No METRICS_TOKEN is set; served without a token outside production and refused
                    in production.
                  </>
                )}
              </p>
              <p className="text-xs text-faint">
                Metrics are prefixed <code className="font-mono">excelex_</code>: request duration
                and count by route pattern, in-flight, database query duration by model, job
                duration, queue depth, plus Node defaults (event loop, heap, GC, CPU).
              </p>
            </div>
          </Card>
        </div>
      </div>

      <p className="text-xs text-faint">
        Generated {new Date(overview.generatedAt).toLocaleString("en-IN")} · active handles{" "}
        {proc.activeHandles} · external memory {bytes(memory.external)}
      </p>
    </div>
  );
}
