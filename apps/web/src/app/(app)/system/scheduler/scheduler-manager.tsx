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
import { Toggle } from "@/components/toggle";
import type {
  ActionResult,
  Schedule,
  ScheduleDetail,
  ScheduleOptions,
  SchedulePage,
  SchedulerStatus,
} from "@/lib/api";
import { formatDuration, formatRelative, formatWhen, jobStatusTone, pretty } from "../format";
import {
  deleteSchedule,
  getScheduleDetail,
  runSchedule,
  saveSchedule,
  setScheduleActive,
} from "./actions";

/**
 * The scheduler's screen.
 *
 * Inline editing, like pin codes: a schedule is eight fields, and a route
 * per schedule would be a page load to change a cron. The expanded row shows
 * the last ten runs and links each into the queue monitor, filtered to this
 * schedule, because "it ran but what happened" is answered there.
 */
export function SchedulerManager({
  page,
  status,
  options,
  canManage,
}: {
  page: SchedulePage;
  status: SchedulerStatus | null;
  options: ScheduleOptions;
  canManage: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Schedule | "new" | null>(null);
  const [expanded, setExpanded] = useState<{ id: string; detail: ScheduleDetail | null } | null>(null);

  const definitions = useMemo<ReadonlyArray<FilterDefinition<Schedule>>>(
    () => [
      { kind: "text", key: "search", label: "Search", placeholder: "Name or description…", span: 2 },
      {
        kind: "select",
        key: "jobName",
        label: "Job",
        options: options.jobNames.map((job) => ({ value: job.name, label: job.name })),
      },
      {
        kind: "select",
        key: "isActive",
        label: "Status",
        options: [
          { value: "true", label: "Active" },
          { value: "false", label: "Inactive" },
        ],
      },
    ],
    [options.jobNames],
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

  async function act(fn: () => Promise<ActionResult>) {
    const result = await fn();
    setNotice(result.ok ? null : (result.error ?? "Something went wrong."));
    if (result.ok) startTransition(() => router.refresh());
    return result.ok;
  }

  async function toggleExpanded(id: string) {
    if (expanded?.id === id) {
      setExpanded(null);
      return;
    }
    setExpanded({ id, detail: null });
    const detail = await getScheduleDetail(id);
    setExpanded((current) => (current?.id === id ? { id, detail } : current));
  }

  return (
    <>
      <FormError message={notice ?? undefined} />

      <StatusCard status={status} />

      <div className="mt-6">
        <FilterBar
          definitions={definitions}
          values={values}
          onChange={apply}
          active={Object.values(values).some((value) => value !== "")}
          onReset={() => startTransition(() => router.replace(pathname))}
          total={page.total}
          shown={page.rows.length}
          noun={{ one: "schedule", many: "schedules" }}
          actions={
            canManage ? (
              <button
                type="button"
                onClick={() => setEditing((current) => (current ? null : "new"))}
                className="btn-primary rounded-lg px-3 py-2 text-sm font-medium"
              >
                {editing ? "Cancel" : "New schedule"}
              </button>
            ) : null
          }
        />

        {editing ? (
          <div className="mb-4" key={editing === "new" ? "new" : editing.id}>
            <ScheduleForm
              row={editing === "new" ? null : editing}
              options={options}
              onDone={() => setEditing(null)}
            />
          </div>
        ) : null}

        <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <MasterTable
            rows={page.rows}
            rowKey={(row) => row.id}
            stickyLastColumn={canManage}
            empty={
              Object.values(values).some(Boolean)
                ? "No schedules match these filters."
                : "No schedules yet. Create one to run a job on a timetable."
            }
            columns={[
              {
                header: "Schedule",
                cell: (row) => (
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(row.id)}
                      className="text-left text-sm font-medium text-fg underline-offset-2 hover:underline"
                    >
                      {row.name}
                    </button>
                    {row.description ? <p className="text-xs text-muted">{row.description}</p> : null}
                    {expanded?.id === row.id ? (
                      <RunsPanel detail={expanded.detail} scheduleId={row.id} />
                    ) : null}
                  </div>
                ),
              },
              {
                header: "Job",
                cell: (row) => (
                  <div>
                    <span className="font-mono text-xs text-fg">{row.jobName}</span>
                    <p className="text-[11px] text-faint">{row.queue}</p>
                  </div>
                ),
              },
              {
                header: "Cron",
                cell: (row) => (
                  <div>
                    <span className="font-mono text-xs text-fg">{row.cron}</span>
                    <p className="text-[11px] text-faint">{describeCron(row.cron)}</p>
                  </div>
                ),
              },
              { header: "Timezone", cell: (row) => <span className="text-xs text-muted">{row.timezone}</span> },
              {
                header: "Next run",
                cell: (row) =>
                  row.isActive && row.nextRunAt ? (
                    <div>
                      <span className="text-xs tabular-nums text-fg">{formatRelative(row.nextRunAt)}</span>
                      <p className="text-[11px] tabular-nums text-faint">{formatWhen(row.nextRunAt)}</p>
                    </div>
                  ) : (
                    <span className="text-xs text-faint">—</span>
                  ),
              },
              {
                header: "Last run",
                cell: (row) => (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs tabular-nums text-muted" title={formatWhen(row.lastRunAt)}>
                      {row.lastRunAt ? formatRelative(row.lastRunAt) : "never"}
                    </span>
                    {row.lastStatus ? (
                      <StatusPill tone={jobStatusTone(row.lastStatus)}>{row.lastStatus.toLowerCase()}</StatusPill>
                    ) : null}
                  </div>
                ),
              },
              {
                header: "Active",
                cell: (row) => (
                  <ActiveSwitch
                    row={row}
                    disabled={!canManage}
                    onChange={(active) => act(() => setScheduleActive(row.id, active))}
                  />
                ),
              },
              {
                header: "Action",
                className: "text-right",
                cell: (row) =>
                  canManage ? (
                    <span className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void act(() => runSchedule(row.id)).then((ok) => {
                            if (ok) setNotice(null);
                          });
                        }}
                        className="rounded border border-line-strong px-2 py-1 text-xs text-fg transition-colors hover:border-accent hover:bg-surface-2"
                      >
                        Run now
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(row)}
                        className="rounded border border-line-strong px-2 py-1 text-xs text-fg transition-colors hover:border-accent hover:bg-surface-2"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${row.name}`}
                        onClick={() => {
                          if (confirm(`Delete the schedule "${row.name}"? Its past runs stay in the queue history.`)) {
                            void act(() => deleteSchedule(row.id));
                          }
                        }}
                        className="rounded border border-line-strong px-2 py-1 text-xs text-red-700 transition-colors hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/50"
                      >
                        Delete
                      </button>
                    </span>
                  ) : null,
              },
            ]}
          />
        </div>

        <Pager page={page.page} pageCount={page.pageCount} total={page.total} pageSize={page.pageSize} />
      </div>
    </>
  );
}

function StatusCard({ status }: { status: SchedulerStatus | null }) {
  const tone = !status ? "slate" : !status.enabled ? "amber" : status.isLeader ? "green" : "slate";
  const label = !status
    ? "unknown"
    : !status.enabled
      ? "disabled in this process"
      : status.isLeader
        ? "leader"
        : "standing by";

  return (
    <section className="card grid gap-3 rounded-xl p-4 sm:grid-cols-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Dispatcher</p>
        <div className="mt-1.5">
          <StatusPill tone={tone}>{label}</StatusPill>
        </div>
        <p className="mt-1 text-[11px] text-faint">
          One process per deployment dispatches; the rest wait for its lease to lapse.
        </p>
      </div>
      <Stat label="Last tick" value={status?.lastTickAt ? formatRelative(status.lastTickAt) : "—"} hint={formatWhen(status?.lastTickAt)} />
      <Stat
        label="Next tick"
        value={status?.nextTickAt ? formatRelative(status.nextTickAt) : "—"}
        hint={status ? `every ${formatDuration(status.tickMs)}` : ""}
      />
      <Stat
        label="Due now"
        value={status ? String(status.dueCount) : "—"}
        hint="Across the deployment; each fires on the next tick."
      />
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-fg">{value}</p>
      <p className="text-[11px] text-faint">{hint}</p>
    </div>
  );
}

function ActiveSwitch({
  row,
  disabled,
  onChange,
}: {
  row: Schedule;
  disabled: boolean;
  onChange: (active: boolean) => void;
}) {
  // Keyed on the server's value, so a refresh that changes it re-seats the
  // toggle rather than leaving it where the last click put it.
  return (
    <div key={String(row.isActive)}>
      <Toggle
        name={`active-${row.id}`}
        label={row.isActive ? "on" : "off"}
        defaultChecked={row.isActive}
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  );
}

function RunsPanel({ detail, scheduleId }: { detail: ScheduleDetail | null; scheduleId: string }) {
  return (
    <div className="mt-2 rounded-lg border border-line bg-surface-2 p-3 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-fg">Last {detail ? detail.runs.length : ""} runs</span>
        <Link href={`/system/queues?scheduleId=${scheduleId}`} className="text-muted underline">
          All runs in the queue monitor →
        </Link>
      </div>
      {!detail ? (
        <p className="text-muted">Loading…</p>
      ) : detail.runs.length === 0 ? (
        <p className="text-muted">This schedule has not run yet.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {detail.runs.map((run) => (
            <li key={run.id} className="flex flex-wrap items-center gap-3 py-1.5">
              <StatusPill tone={jobStatusTone(run.status)}>{run.status.toLowerCase()}</StatusPill>
              <span className="tabular-nums text-muted" title={formatWhen(run.createdAt)}>
                {formatRelative(run.createdAt)}
              </span>
              <span className="tabular-nums text-muted">{formatDuration(run.durationMs)}</span>
              {run.error ? <span className="truncate text-red-600 dark:text-red-400">{run.error}</span> : null}
              <Link href={`/system/queues?scheduleId=${scheduleId}`} className="ml-auto text-faint underline">
                {run.id.slice(0, 8)}…
              </Link>
            </li>
          ))}
        </ul>
      )}
      {detail && detail.payload && Object.keys(detail.payload as object).length > 0 ? (
        <pre className="mt-2 max-h-40 overflow-auto rounded border border-line bg-surface p-2 font-mono text-[11px] text-fg">
          {pretty(detail.payload)}
        </pre>
      ) : null}
    </div>
  );
}

function ScheduleForm({
  row,
  options,
  onDone,
}: {
  row: Schedule | null;
  options: ScheduleOptions;
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState(
    async (previous: ActionResult | null, form: FormData) => {
      const result = await saveSchedule(previous, form);
      if (result.ok) onDone();
      return result;
    },
    null,
  );
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [cron, setCron] = useState(row?.cron ?? "0 2 * * *");
  const [jobName, setJobName] = useState(row?.jobName ?? options.jobNames[0]?.name ?? "");
  const description = options.jobNames.find((job) => job.name === jobName)?.description;
  const timezones = row && !options.timezones.includes(row.timezone) ? [row.timezone, ...options.timezones] : options.timezones;

  return (
    <form
      action={submit}
      onSubmit={(event) => {
        const raw = String(new FormData(event.currentTarget).get("payload") ?? "").trim();
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw);
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error();
          setPayloadError(null);
        } catch {
          setPayloadError("Payload must be a JSON object.");
          event.preventDefault();
        }
      }}
    >
      {row ? <input type="hidden" name="id" value={row.id} /> : null}
      <FormError message={payloadError ?? state?.error} />

      <FormPanel title={row ? `Edit ${row.name}` : "New schedule"}>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Name" span={2}>
            <input name="name" required minLength={2} maxLength={80} defaultValue={row?.name ?? ""} className={formField} />
          </Field>
          <Field label="Description" span={2}>
            <input name="description" maxLength={500} defaultValue={row?.description ?? ""} className={formField} />
          </Field>

          <Field label="Job" hint={description}>
            <select name="jobName" value={jobName} onChange={(event) => setJobName(event.target.value)} className={formField}>
              {options.jobNames.map((job) => (
                <option key={job.name} value={job.name}>
                  {job.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Queue">
            <select name="queue" defaultValue={row?.queue ?? "scheduled"} className={formField}>
              {options.queues.map((queue) => (
                <option key={queue} value={queue}>
                  {queue}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cron (minute hour day month weekday)" hint={describeCron(cron)}>
            <input
              name="cron"
              required
              value={cron}
              onChange={(event) => setCron(event.target.value)}
              placeholder="0 2 * * *"
              className={`${formField} font-mono`}
            />
          </Field>
          <Field label="Timezone">
            <select name="timezone" defaultValue={row?.timezone ?? "Asia/Kolkata"} className={formField}>
              {timezones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Payload (JSON object)" span={3}>
            <textarea
              name="payload"
              rows={3}
              defaultValue={row ? pretty(row.payload) : ""}
              placeholder="{}"
              className={`${formField} font-mono text-xs`}
            />
          </Field>
          <div className="flex flex-col justify-end gap-3">
            <Toggle name="isActive" label="Active" defaultChecked={row?.isActive ?? true} />
            <button
              type="submit"
              disabled={pending}
              className="btn-primary w-full rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </FormPanel>
    </form>
  );
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * A human hint for the common cron shapes. Anything it does not recognise is
 * shown raw — a wrong hint is worse than none.
 */
export function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return "five fields expected";
  const [minute, hour, dom, month, dow] = parts as [string, string, string, string, string];
  const num = (value: string) => (/^\d+$/.test(value) ? Number(value) : null);
  const clock = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

  if (cron.trim() === "* * * * *") return "every minute";

  const everyMinutes = /^\*\/(\d+)$/.exec(minute);
  if (everyMinutes && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    return `every ${everyMinutes[1]} minutes`;
  }
  const everyHours = /^\*\/(\d+)$/.exec(hour);
  if (num(minute) !== null && everyHours && dom === "*" && month === "*" && dow === "*") {
    return `every ${everyHours[1]} hours at :${String(num(minute)).padStart(2, "0")}`;
  }
  if (num(minute) !== null && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    return `hourly at :${String(num(minute)).padStart(2, "0")}`;
  }

  const m = num(minute);
  const h = num(hour);
  if (m === null || h === null) return cron;

  if (dom === "*" && month === "*" && dow === "*") return `daily at ${clock(h, m)}`;
  if (dom === "*" && month === "*" && /^\d$/.test(dow)) return `every ${DAYS[Number(dow)] ?? dow} at ${clock(h, m)}`;
  if (dom === "*" && month === "*" && dow === "1-5") return `weekdays at ${clock(h, m)}`;
  if (dom === "*" && month === "*" && (dow === "0,6" || dow === "6,0")) return `weekends at ${clock(h, m)}`;
  if (num(dom) !== null && month === "*" && dow === "*") return `monthly on day ${dom} at ${clock(h, m)}`;
  return cron;
}
