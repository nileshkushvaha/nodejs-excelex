"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActionState, useMemo, useState, useTransition } from "react";

import { FilterBar, type FilterDefinition } from "@/components/filter-bar";
import { Field, FormError, formField } from "@/components/form-field";
import { FormPanel } from "@/components/form-page";
import { MasterTable } from "@/components/master-table";
import { Pager } from "@/components/pager";
import { StatusPill } from "@/components/status-pill";
import type {
  ActionResult,
  JobDetail,
  JobPage,
  JobRow,
  QueueLive,
  QueueSummary,
  QueuesLive,
} from "@/lib/api";
import { formatDuration, formatRelative, formatWhen, jobStatusTone, pretty } from "../format";
import {
  cancelJob,
  cleanQueue,
  getJobDetail,
  pauseQueue,
  resumeQueue,
  retryJob,
  runJob,
} from "./actions";

const STATUSES = ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"] as const;

/**
 * The queue monitor's screen.
 *
 * Live tiles first, because "is anything stuck" is the question that brings
 * someone here; the history strip second, because "is it slower than last
 * week" is the next one; the table last, because it is where the answer to
 * either is looked up. The detail opens in place rather than on a route: a
 * failed job's stack trace is read once and dismissed, not bookmarked.
 */
export function QueuesManager({
  live,
  summary,
  jobs,
  canManage,
  scheduleId,
}: {
  live: QueuesLive;
  summary: QueueSummary | null;
  jobs: JobPage;
  canManage: boolean;
  scheduleId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ id: string; detail: JobDetail | null; loading: boolean } | null>(null);
  const [showRun, setShowRun] = useState(false);

  const definitions = useMemo<ReadonlyArray<FilterDefinition<JobRow>>>(
    () => [
      { kind: "text", key: "search", label: "Error contains", placeholder: "Text from the error…", span: 2 },
      {
        kind: "select",
        key: "status",
        label: "Status",
        options: STATUSES.map((status) => ({ value: status, label: status.toLowerCase() })),
      },
      {
        kind: "select",
        key: "queue",
        label: "Queue",
        options: live.queues.map((queue) => ({ value: queue.queue, label: queue.queue })),
      },
      {
        kind: "select",
        key: "name",
        label: "Job",
        options: live.handlers.map((name) => ({ value: name, label: name })),
      },
    ],
    [live.queues, live.handlers],
  );

  const values = Object.fromEntries(
    definitions.map((definition) => [definition.key, params.get(definition.key) ?? ""]),
  );

  function apply(next: Record<string, string>) {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    query.delete("page");
    startTransition(() => router.replace(`${pathname}?${query.toString()}`));
  }

  async function open(id: string) {
    setSelected({ id, detail: null, loading: true });
    const detail = await getJobDetail(id);
    setSelected((current) => (current?.id === id ? { id, detail, loading: false } : current));
  }

  async function act(fn: () => Promise<ActionResult>, after?: () => void) {
    const result = await fn();
    setNotice(result.ok ? null : (result.error ?? "Something went wrong."));
    if (result.ok) {
      after?.();
      startTransition(() => router.refresh());
    }
  }

  return (
    <>
      <FormError message={notice ?? undefined} />

      <section className="grid gap-3 sm:grid-cols-3">
        {live.queues.map((queue) => (
          <QueueTile
            key={queue.queue}
            queue={queue}
            oldest={summary?.oldestWaiting[queue.queue] ?? null}
            canManage={canManage}
            onAction={act}
          />
        ))}
      </section>

      {summary ? <SummaryStrip summary={summary} queues={live.queues.map((queue) => queue.queue)} /> : null}

      <div className="mt-6">
        <FilterBar
          definitions={definitions}
          values={values}
          onChange={apply}
          active={Object.values(values).some((value) => value !== "") || Boolean(scheduleId)}
          onReset={() => startTransition(() => router.replace(pathname))}
          total={jobs.total}
          shown={jobs.rows.length}
          noun={{ one: "job", many: "jobs" }}
          before={
            scheduleId ? (
              <div className="flex items-end">
                <StatusPill tone="amber" title={scheduleId}>
                  schedule {scheduleId.slice(0, 8)}…
                  <Link href="/system/scheduler" className="ml-1 underline">
                    view
                  </Link>
                </StatusPill>
              </div>
            ) : null
          }
          actions={
            canManage ? (
              <button
                type="button"
                onClick={() => setShowRun((value) => !value)}
                className="btn-primary rounded-lg px-3 py-2 text-sm font-medium"
              >
                {showRun ? "Cancel" : "Run a job"}
              </button>
            ) : null
          }
        />

        {showRun ? (
          <div className="mb-4">
            <RunJobForm handlers={live.handlers} queues={live.queues.map((queue) => queue.queue)} onDone={() => setShowRun(false)} />
          </div>
        ) : null}

        {selected ? (
          <div className="mb-4">
            <JobDetailPanel
              detail={selected.detail}
              loading={selected.loading}
              canManage={canManage}
              onClose={() => setSelected(null)}
              onRetry={() => act(() => retryJob(selected.id), () => setSelected(null))}
              onCancel={() => act(() => cancelJob(selected.id), () => open(selected.id))}
            />
          </div>
        ) : null}

        <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <MasterTable
            rows={jobs.rows}
            rowKey={(row) => row.id}
            stickyLastColumn={false}
            empty={
              jobs.total === 0 && !Object.values(values).some(Boolean)
                ? "No background jobs yet. Anything this account queues will appear here."
                : "No jobs match these filters."
            }
            columns={[
              {
                header: "Job",
                cell: (row) => (
                  <button
                    type="button"
                    onClick={() => open(row.id)}
                    className="text-left font-mono text-xs font-medium text-fg underline-offset-2 hover:underline"
                    title={row.id}
                  >
                    {row.name}
                  </button>
                ),
              },
              { header: "Queue", cell: (row) => <span className="text-xs text-muted">{row.queue}</span> },
              {
                header: "Status",
                cell: (row) => (
                  <StatusPill tone={jobStatusTone(row.status)} title={row.error ?? undefined}>
                    {row.status.toLowerCase()}
                  </StatusPill>
                ),
              },
              {
                header: "Attempts",
                cell: (row) => (
                  <span className="text-xs tabular-nums text-muted">
                    {row.attempts}/{row.maxAttempts}
                  </span>
                ),
              },
              {
                header: "Duration",
                cell: (row) => <span className="text-xs tabular-nums text-fg">{formatDuration(row.durationMs)}</span>,
              },
              {
                header: "Created",
                cell: (row) => (
                  <span className="text-xs tabular-nums text-muted" title={formatWhen(row.createdAt)}>
                    {formatRelative(row.createdAt)}
                  </span>
                ),
              },
              {
                header: "Requested by",
                cell: (row) => (
                  <span className="text-xs text-muted">
                    {row.requestedBy ? row.requestedBy.fullName : row.scheduleId ? "schedule" : "—"}
                  </span>
                ),
              },
            ]}
          />
        </div>

        <Pager page={jobs.page} pageCount={jobs.pageCount} total={jobs.total} pageSize={jobs.pageSize} />
      </div>
    </>
  );
}

function QueueTile({
  queue,
  oldest,
  canManage,
  onAction,
}: {
  queue: QueueLive;
  oldest: { since: string; ageMs: number } | null;
  canManage: boolean;
  onAction: (fn: () => Promise<ActionResult>) => Promise<void>;
}) {
  const [cleaning, setCleaning] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<ActionResult>) => {
    setBusy(true);
    try {
      await onAction(fn);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card relative overflow-hidden rounded-xl p-4">
      <span aria-hidden="true" className="brand-gradient absolute inset-x-0 top-0 h-1 opacity-80" />
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{queue.queue}</p>
          <p className="mt-0.5 text-[11px] text-faint">concurrency {queue.concurrency} per worker</p>
        </div>
        {queue.paused ? <StatusPill tone="amber">paused</StatusPill> : <StatusPill tone="green">running</StatusPill>}
      </div>

      <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
        {(
          [
            ["waiting", queue.waiting + queue.prioritized],
            ["active", queue.active],
            ["delayed", queue.delayed],
            ["failed", queue.failed],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt className="text-[10px] uppercase tracking-wide text-faint">{label}</dt>
            <dd
              className={`text-xl font-bold tabular-nums ${
                label === "failed" && value > 0 ? "text-red-600 dark:text-red-400" : "text-fg"
              }`}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-2 text-[11px] text-faint">
        {oldest
          ? `Oldest waiting: ${formatDuration(oldest.ageMs)}`
          : "Nothing waiting for this account."}
      </p>

      {canManage ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {queue.paused ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => resumeQueue(queue.queue))}
              className="btn-secondary rounded px-2 py-1 text-xs disabled:opacity-50"
            >
              Resume
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (confirm(`Pause the ${queue.queue} queue? This affects every account on this deployment.`)) {
                  void run(() => pauseQueue(queue.queue));
                }
              }}
              className="btn-secondary rounded px-2 py-1 text-xs disabled:opacity-50"
            >
              Pause
            </button>
          )}
          <button
            type="button"
            onClick={() => setCleaning((value) => !value)}
            className="btn-secondary rounded px-2 py-1 text-xs"
          >
            {cleaning ? "Close" : "Clean…"}
          </button>
          <span className="text-[10px] text-faint">Platform-wide</span>
        </div>
      ) : null}

      {cleaning ? (
        <form
          className="mt-2 flex flex-wrap items-end gap-2 text-xs"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const state = String(form.get("state")) === "failed" ? "failed" : "completed";
            const minutes = Number(form.get("minutes") ?? 60) || 0;
            if (confirm(`Remove ${state} records older than ${minutes} min from Redis, for every account on this deployment? The Postgres history is kept.`)) {
              void run(() => cleanQueue(queue.queue, state, minutes)).then(() => setCleaning(false));
            }
          }}
        >
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase text-faint">State</span>
            <select name="state" className={`${formField} py-1`}>
              <option value="completed">completed</option>
              <option value="failed">failed</option>
            </select>
          </label>
          <label className="block w-24">
            <span className="mb-1 block text-[10px] uppercase text-faint">Older than (min)</span>
            <input name="minutes" type="number" min={0} defaultValue={60} className={`${formField} py-1 tabular-nums`} />
          </label>
          <button type="submit" disabled={busy} className="btn-primary rounded px-2 py-1 text-xs disabled:opacity-50">
            Clean
          </button>
        </form>
      ) : null}
    </div>
  );
}

function SummaryStrip({ summary, queues }: { summary: QueueSummary; queues: string[] }) {
  const byQueue = (rows: QueueSummary["last24h"], queue: string) => rows.find((row) => row.queue === queue && row.name === null);
  const anything = summary.last7d.length > 0;

  return (
    <section className="card mt-4 rounded-xl">
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <h2 className="text-sm font-semibold text-fg">Last 24 hours</h2>
        <span className="text-[11px] text-faint">This account only · sparkline is jobs finished per hour</span>
      </div>
      {anything ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Queue</th>
                <th className="px-4 py-2 font-medium">Succeeded</th>
                <th className="px-4 py-2 font-medium">Failed</th>
                <th className="px-4 py-2 font-medium">Cancelled</th>
                <th className="px-4 py-2 font-medium">Avg</th>
                <th className="px-4 py-2 font-medium">p95</th>
                <th className="px-4 py-2 font-medium">7d succeeded / failed</th>
                <th className="px-4 py-2 font-medium">Throughput</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {queues.map((queue) => {
                const day = byQueue(summary.last24h, queue);
                const week = byQueue(summary.last7d, queue);
                const series = summary.throughput.find((entry) => entry.queue === queue)?.hours ?? [];
                return (
                  <tr key={queue}>
                    <td className="px-4 py-2 text-xs font-medium text-fg">{queue}</td>
                    <td className="px-4 py-2 text-xs tabular-nums text-fg">{day?.succeeded ?? 0}</td>
                    <td className={`px-4 py-2 text-xs tabular-nums ${day?.failed ? "text-red-600 dark:text-red-400" : "text-muted"}`}>
                      {day?.failed ?? 0}
                    </td>
                    <td className="px-4 py-2 text-xs tabular-nums text-muted">{day?.cancelled ?? 0}</td>
                    <td className="px-4 py-2 text-xs tabular-nums text-muted">{formatDuration(day?.avgMs)}</td>
                    <td className="px-4 py-2 text-xs tabular-nums text-muted">{formatDuration(day?.p95Ms)}</td>
                    <td className="px-4 py-2 text-xs tabular-nums text-muted">
                      {week?.succeeded ?? 0} / {week?.failed ?? 0}
                    </td>
                    <td className="px-4 py-2">
                      <Sparkline
                        points={series.map((hour) => hour.succeeded + hour.failed)}
                        failed={series.map((hour) => hour.failed)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-6 text-center text-sm text-muted">Nothing has finished in the last week.</p>
      )}
    </section>
  );
}

/** Pure SVG: twenty-four bars, one per hour, red where any failed. */
function Sparkline({ points, failed }: { points: number[]; failed: number[] }) {
  const width = 120;
  const height = 24;
  const max = Math.max(1, ...points);
  const barWidth = width / Math.max(1, points.length);
  const total = points.reduce((sum, value) => sum + value, 0);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={`${total} jobs finished in the last 24 hours`}
      className="block"
    >
      {points.map((value, index) => {
        const barHeight = value === 0 ? 1 : Math.max(2, (value / max) * height);
        return (
          <rect
            key={index}
            x={index * barWidth + 0.5}
            y={height - barHeight}
            width={Math.max(1, barWidth - 1)}
            height={barHeight}
            rx={0.5}
            className={
              (failed[index] ?? 0) > 0
                ? "fill-red-500/80"
                : value === 0
                  ? "fill-line-strong"
                  : "fill-emerald-500/80"
            }
          />
        );
      })}
    </svg>
  );
}

function JobDetailPanel({
  detail,
  loading,
  canManage,
  onClose,
  onRetry,
  onCancel,
}: {
  detail: JobDetail | null;
  loading: boolean;
  canManage: boolean;
  onClose: () => void;
  onRetry: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="card rounded-xl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-fg">
            {detail ? detail.name : loading ? "Loading…" : "Job"}
          </h2>
          {detail ? <StatusPill tone={jobStatusTone(detail.status)}>{detail.status.toLowerCase()}</StatusPill> : null}
          {detail ? <span className="font-mono text-[11px] text-faint">{detail.id}</span> : null}
        </div>
        <div className="flex items-center gap-2">
          {canManage && detail && detail.status !== "RUNNING" && detail.status !== "QUEUED" ? (
            <button type="button" onClick={onRetry} className="btn-secondary rounded px-2 py-1 text-xs">
              Retry as new job
            </button>
          ) : null}
          {canManage && detail && detail.status === "QUEUED" ? (
            <button
              type="button"
              onClick={() => {
                if (confirm("Cancel this job? It will not run.")) onCancel();
              }}
              className="rounded border border-line-strong px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/50"
            >
              Cancel job
            </button>
          ) : null}
          <button type="button" onClick={onClose} className="btn-secondary rounded px-2 py-1 text-xs">
            Close
          </button>
        </div>
      </div>

      {!detail ? (
        <p className="px-4 py-6 text-sm text-muted">{loading ? "Fetching the job…" : "That job could not be loaded."}</p>
      ) : (
        <div className="grid gap-4 p-4 lg:grid-cols-3">
          <dl className="space-y-1.5 text-xs">
            <Row label="Queue" value={detail.queue} />
            <Row label="Attempts" value={`${detail.attempts} of ${detail.maxAttempts}`} />
            <Row label="Requested by" value={detail.requestedBy?.fullName ?? (detail.scheduleId ? "a schedule" : "—")} />
            <Row
              label="Schedule"
              value={
                detail.scheduleId ? (
                  <Link href={`/system/queues?scheduleId=${detail.scheduleId}`} className="underline">
                    {detail.scheduleId.slice(0, 8)}…
                  </Link>
                ) : (
                  "—"
                )
              }
            />
            <Row label="Created" value={formatWhen(detail.createdAt)} />
            <Row label="Scheduled for" value={formatWhen(detail.scheduledFor)} />
            <Row label="Started" value={formatWhen(detail.startedAt)} />
            <Row label="Finished" value={formatWhen(detail.finishedAt)} />
            <Row label="Duration" value={formatDuration(detail.durationMs)} />
            <Row
              label="Live in Redis"
              value={
                detail.live
                  ? `${detail.live.state} · attempts ${detail.live.attemptsMade}${
                      detail.live.processedOn ? ` · processed ${formatWhen(detail.live.processedOn)}` : ""
                    }${detail.live.finishedOn ? ` · finished ${formatWhen(detail.live.finishedOn)}` : ""}`
                  : "no longer in Redis"
              }
            />
            {detail.live?.failedReason ? <Row label="Live failure" value={detail.live.failedReason} /> : null}
          </dl>

          <div className="space-y-3 lg:col-span-2">
            <Block title="Payload" text={pretty(detail.payload) || "{}"} />
            {detail.result !== null && detail.result !== undefined ? (
              <Block title="Result" text={pretty(detail.result)} />
            ) : null}
            {detail.error ? <Block title="Error" text={detail.error} tone="red" /> : null}
          </div>
        </div>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-faint">{label}</dt>
      <dd className="break-all text-fg">{value}</dd>
    </div>
  );
}

function Block({ title, text, tone }: { title: string; text: string; tone?: "red" }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">{title}</p>
      <pre
        className={`max-h-72 overflow-auto rounded-lg border p-3 font-mono text-[11px] leading-relaxed ${
          tone === "red"
            ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
            : "border-line bg-surface-2 text-fg"
        }`}
      >
        {text}
      </pre>
    </div>
  );
}

function RunJobForm({
  handlers,
  queues,
  onDone,
}: {
  handlers: string[];
  queues: string[];
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState(
    async (previous: ActionResult | null, form: FormData) => {
      const result = await runJob(previous, form);
      if (result.ok) onDone();
      return result;
    },
    null,
  );
  const [payloadError, setPayloadError] = useState<string | null>(null);

  return (
    <form
      action={submit}
      onSubmit={(event) => {
        // Checked before it leaves the browser: a typo in the JSON should
        // not cost a round trip to be told about.
        const raw = String(new FormData(event.currentTarget).get("payload") ?? "").trim();
        if (!raw) return;
        try {
          JSON.parse(raw);
          setPayloadError(null);
        } catch {
          setPayloadError("Payload must be valid JSON.");
          event.preventDefault();
        }
      }}
    >
      <FormError message={payloadError ?? state?.error} />
      <FormPanel title="Run a job" description="Queues one job for this account, attributed to you.">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Job">
            <select name="name" required className={formField}>
              {handlers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Queue">
            <select name="queue" defaultValue="default" className={formField}>
              {queues.map((queue) => (
                <option key={queue} value={queue}>
                  {queue}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Payload (JSON object)" span={2}>
            <textarea name="payload" rows={3} placeholder="{}" className={`${formField} font-mono text-xs`} />
          </Field>
          <div className="sm:col-span-4">
            <button type="submit" disabled={pending} className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60">
              {pending ? "Queuing…" : "Queue it"}
            </button>
          </div>
        </div>
      </FormPanel>
    </form>
  );
}
