"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { FilterBar, filterControl, type FilterDefinition } from "@/components/filter-bar";
import { MasterTable } from "@/components/master-table";
import { formatWhen } from "@/components/mini-bars";
import { Pager } from "@/components/pager";
import { StatusPill, type PillTone } from "@/components/status-pill";
import type { LoginAttemptRow, LoginHistoryPage, LoginOutcome, UserLoginHistory } from "@/lib/api";
import { loadUserLoginHistory } from "./actions";

const OUTCOMES: ReadonlyArray<{ value: LoginOutcome; label: string; tone: PillTone }> = [
  { value: "SUCCEEDED", label: "Succeeded", tone: "green" },
  { value: "BAD_PASSWORD", label: "Bad password", tone: "amber" },
  { value: "LOCKED", label: "Locked", tone: "red" },
  { value: "LOCKED_OUT", label: "Locked out", tone: "red" },
  { value: "INACTIVE", label: "Inactive", tone: "slate" },
  { value: "UNKNOWN_USER", label: "Unknown user", tone: "slate" },
  { value: "THROTTLED", label: "Throttled", tone: "amber" },
];

const outcomeOf = (value: LoginOutcome) => OUTCOMES.find((row) => row.value === value) ?? OUTCOMES[5]!;

function OutcomePill({ outcome }: { outcome: LoginOutcome }) {
  const meta = outcomeOf(outcome);
  return <StatusPill tone={meta.tone}>{meta.label}</StatusPill>;
}

function DeviceCell({ row }: { row: { device: { browser: string | null; os: string | null }; userAgent: string | null } }) {
  const parts = [row.device.browser, row.device.os].filter(Boolean);
  return (
    <span className="text-xs text-muted" title={row.userAgent ?? undefined}>
      {parts.length ? parts.join(" · ") : row.userAgent ? "Other" : "—"}
    </span>
  );
}

/**
 * The login table and the person panel.
 *
 * A row is a person's attempt, so clicking it opens that person: their last
 * fifty attempts and the sessions they hold right now. Unknown addresses have
 * no person to open, and say so.
 */
export function LoginHistoryManager({ page, exportQuery }: { page: LoginHistoryPage; exportQuery: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<{ userId: string; data: UserLoginHistory | null; loading: boolean } | null>(null);

  const definitions = useMemo<ReadonlyArray<FilterDefinition<LoginAttemptRow>>>(
    () => [
      { kind: "text", key: "search", label: "Search", placeholder: "Email address or IP…", span: 2 },
      {
        kind: "select",
        key: "outcome",
        label: "Outcome",
        options: OUTCOMES.map((row) => ({ value: row.value, label: row.label })),
        allLabel: "Any outcome",
      },
    ],
    [],
  );

  const keys = [...definitions.map((definition) => definition.key), "from", "to", "userId"];
  const values = Object.fromEntries(keys.map((key) => [key, params.get(key) ?? ""]));

  function apply(next: Record<string, string>) {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    query.delete("page");
    startTransition(() => router.replace(`${pathname}?${query.toString()}`));
  }

  async function openUser(userId: string) {
    setPanel({ userId, data: null, loading: true });
    const data = await loadUserLoginHistory(userId);
    setPanel((current) => (current?.userId === userId ? { userId, data, loading: false } : current));
  }

  const dateField = (key: "from" | "to", label: string) => (
    <label className="block min-w-40 flex-1">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <input
        type="date"
        value={values[key] ?? ""}
        onChange={(event) => apply({ [key]: event.target.value })}
        className={filterControl}
      />
    </label>
  );

  return (
    <>
      <FilterBar
        definitions={definitions}
        values={values}
        onChange={apply}
        active={Object.values(values).some((value) => value !== "")}
        onReset={() => startTransition(() => router.replace(pathname))}
        total={page.total}
        shown={page.rows.length}
        noun={{ one: "attempt", many: "attempts" }}
        before={
          <>
            {dateField("from", "From")}
            {dateField("to", "To")}
          </>
        }
        actions={
          <>
            {values["userId"] ? (
              <button
                type="button"
                onClick={() => apply({ userId: "" })}
                className="btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
              >
                Show everyone
              </button>
            ) : null}
            <a
              href={`/api/v1/system/login-history/export${exportQuery ? `?${exportQuery}` : ""}`}
              className="btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
              title="Download the attempts matching these filters (up to 50,000 rows). The download itself is recorded in the activity log."
            >
              Export CSV
            </a>
          </>
        }
      />

      <div className={`grid gap-4 ${panel ? "xl:grid-cols-[minmax(0,1fr)_380px]" : ""}`}>
        <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <MasterTable
            rows={page.rows}
            rowKey={(row) => row.id}
            stickyLastColumn={false}
            empty={
              Object.values(values).some(Boolean)
                ? "No attempts match these filters."
                : "No sign-ins have been recorded yet."
            }
            columns={[
              {
                header: "When",
                className: "whitespace-nowrap",
                cell: (row) => <span className="text-xs tabular-nums text-muted">{formatWhen(row.createdAt)}</span>,
              },
              {
                header: "Who",
                cell: (row) =>
                  row.user ? (
                    <button
                      type="button"
                      onClick={() => void openUser(row.user!.id)}
                      className="block text-left"
                      title="Show this person's history"
                    >
                      <span className="block text-fg hover:underline">{row.user.fullName}</span>
                      <span className="block text-xs text-muted">{row.user.email}</span>
                    </button>
                  ) : (
                    <span className="block">
                      <span className="block text-muted">{row.email}</span>
                      <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted">
                        unknown address
                      </span>
                    </span>
                  ),
              },
              { header: "Outcome", cell: (row) => <OutcomePill outcome={row.outcome} /> },
              {
                header: "IP",
                cell: (row) => <span className="font-mono text-xs text-muted">{row.ip ?? "—"}</span>,
              },
              { header: "Device", cell: (row) => <DeviceCell row={row} /> },
              {
                header: "Session",
                cell: (row) =>
                  row.sessionId ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted" title={row.sessionId}>
                      <span
                        aria-hidden
                        className={`inline-block h-2 w-2 rounded-full ${row.sessionActive ? "bg-emerald-500" : "bg-line-strong"}`}
                      />
                      {row.sessionActive ? "active" : "ended"}
                    </span>
                  ) : (
                    <span className="text-xs text-faint">—</span>
                  ),
              },
            ]}
          />
          <Pager page={page.page} pageCount={page.pageCount} total={page.total} pageSize={page.pageSize} />
        </div>

        {panel ? (
          <aside className="card h-fit rounded-xl p-4 xl:sticky xl:top-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Person</p>
                {panel.data ? (
                  <>
                    <p className="truncate text-base font-semibold text-fg">{panel.data.user.fullName}</p>
                    <p className="truncate text-xs text-muted">{panel.data.user.email}</p>
                  </>
                ) : (
                  <p className="text-sm text-muted">{panel.loading ? "Loading…" : "Could not load this person."}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPanel(null)}
                className="rounded border border-line-strong px-2 py-1 text-xs text-fg hover:bg-surface-2"
              >
                Close
              </button>
            </div>

            {panel.data ? (
              <>
                <div className="mb-3 flex flex-wrap gap-2">
                  {panel.data.user.lockedUntil && new Date(panel.data.user.lockedUntil) > new Date() ? (
                    <StatusPill tone="red">locked</StatusPill>
                  ) : null}
                  {!panel.data.user.isActive ? <StatusPill tone="slate">inactive</StatusPill> : null}
                  <button
                    type="button"
                    onClick={() => apply({ userId: panel.userId })}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    Filter the table to this person
                  </button>
                </div>

                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  Active sessions ({panel.data.activeSessions.length})
                </p>
                {panel.data.activeSessions.length === 0 ? (
                  <p className="mt-1 text-xs text-muted">Not signed in anywhere right now.</p>
                ) : (
                  <ul className="mt-1 divide-y divide-line-soft text-xs">
                    {panel.data.activeSessions.map((session) => (
                      <li key={session.id} className="py-1.5">
                        <span className="block text-fg">
                          <DeviceCell row={session} /> <span className="font-mono text-muted">{session.ip ?? ""}</span>
                        </span>
                        <span className="block text-faint">
                          since {formatWhen(session.createdAt)} · idle until {formatWhen(session.idleExpiresAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-[11px] text-faint">Sessions are revoked from the Users screen.</p>

                <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted">
                  Last {panel.data.attempts.length} attempts
                </p>
                <ul className="mt-1 max-h-96 divide-y divide-line-soft overflow-auto text-xs">
                  {panel.data.attempts.map((attempt) => (
                    <li key={attempt.id} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="min-w-0">
                        <span className="block tabular-nums text-fg">{formatWhen(attempt.createdAt)}</span>
                        <span className="block truncate font-mono text-faint">
                          {attempt.ip ?? "—"} · {[attempt.device.browser, attempt.device.os].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </span>
                      <OutcomePill outcome={attempt.outcome} />
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </aside>
        ) : null}
      </div>
    </>
  );
}
