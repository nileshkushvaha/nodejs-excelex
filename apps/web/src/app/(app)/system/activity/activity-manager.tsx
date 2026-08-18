"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { FilterBar, filterControl, type FilterDefinition } from "@/components/filter-bar";
import { formatWhen } from "@/components/mini-bars";
import { Pager } from "@/components/pager";
import type { ActivityDetail, ActivityFacets, ActivityPage, ActivityRow } from "@/lib/api";
import { loadActivityDetail } from "./actions";

/**
 * The activity log's table and filters.
 *
 * Read-only by construction: the only interaction is opening a row's detail,
 * which fetches the metadata that the list deliberately leaves out. Filters
 * write to the URL and let the server component re-query — the trail is far
 * too large to filter in the browser, and a filtered view should be a link.
 */
export function ActivityManager({
  page,
  facets,
  exportQuery,
}: {
  page: ActivityPage;
  facets: ActivityFacets;
  exportQuery: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<{ id: string; detail: ActivityDetail | null; loading: boolean } | null>(null);

  const definitions = useMemo<ReadonlyArray<FilterDefinition<ActivityRow>>>(
    () => [
      { kind: "text", key: "search", label: "Search", placeholder: "Action, entity or record id…", span: 2 },
      {
        kind: "select",
        key: "actorId",
        label: "Actor",
        options: facets.actors.map((row) => ({
          value: row.actor.id,
          label: `${row.actor.fullName} (${row.count})`,
        })),
        allLabel: "Anyone",
      },
      {
        kind: "select",
        key: "actionPrefix",
        label: "Area",
        options: facets.domains.map((row) => ({
          value: row.domain,
          label: `${row.domain} (${row.actions.reduce((sum, action) => sum + action.count, 0)})`,
        })),
        allLabel: "All areas",
      },
      {
        kind: "select",
        key: "entity",
        label: "Entity",
        options: facets.entities.map((entity) => ({ value: entity, label: entity })),
        allLabel: "Any entity",
      },
    ],
    [facets],
  );

  const keys = [...definitions.map((definition) => definition.key), "from", "to"];
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

  async function toggle(row: ActivityRow) {
    if (open?.id === row.id) {
      setOpen(null);
      return;
    }
    setOpen({ id: row.id, detail: null, loading: true });
    const detail = await loadActivityDetail(row.id);
    setOpen((current) => (current?.id === row.id ? { id: row.id, detail, loading: false } : current));
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
        noun={{ one: "event", many: "events" }}
        before={
          <>
            {dateField("from", "From")}
            {dateField("to", "To")}
          </>
        }
        actions={
          <a
            href={`/api/v1/system/activity/export${exportQuery ? `?${exportQuery}` : ""}`}
            className="btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
            title="Download the events matching these filters (up to 50,000 rows). The download itself is recorded in the trail."
          >
            Export CSV
          </a>
        }
      />

      <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <div className="card overflow-hidden rounded-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="brand-gradient-soft border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th className="px-4 py-2.5 font-medium">Actor</th>
                  <th className="px-4 py-2.5 font-medium">Action</th>
                  <th className="px-4 py-2.5 font-medium">Entity</th>
                  <th className="px-4 py-2.5 font-medium">IP</th>
                  <th className="px-4 py-2.5 text-right font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {page.rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                      {page.total === 0 && !Object.values(values).some(Boolean)
                        ? "Nothing has been recorded yet. Events appear here as people sign in and change things."
                        : "No events match these filters."}
                    </td>
                  </tr>
                ) : (
                  page.rows.map((row) => (
                    <RowGroup
                      key={row.id}
                      row={row}
                      open={open?.id === row.id ? open : null}
                      onToggle={() => void toggle(row)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Pager page={page.page} pageCount={page.pageCount} total={page.total} pageSize={page.pageSize} />
    </>
  );
}

function RowGroup({
  row,
  open,
  onToggle,
}: {
  row: ActivityRow;
  open: { detail: ActivityDetail | null; loading: boolean } | null;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="group row-hover hover:bg-surface-2">
        <td className="whitespace-nowrap px-4 py-2.5 text-xs tabular-nums text-muted">{formatWhen(row.createdAt)}</td>
        <td className="px-4 py-2.5">
          {row.actor ? (
            <span className="block">
              <span className="block text-fg">{row.actor.fullName}</span>
              <span className="block text-xs text-muted">{row.actor.email}</span>
            </span>
          ) : (
            <span className="text-xs italic text-muted">System</span>
          )}
        </td>
        <td className="px-4 py-2.5">
          <span className="block text-fg">{row.actionLabel}</span>
          <span className="block font-mono text-[11px] text-faint">{row.action}</span>
        </td>
        <td className="px-4 py-2.5 font-mono text-xs text-muted">
          {row.entity ? (
            <>
              {row.entity}
              {row.entityId ? <span className="text-faint"> · {row.entityId}</span> : null}
            </>
          ) : (
            "—"
          )}
        </td>
        <td className="px-4 py-2.5 font-mono text-xs text-muted">{row.ip ?? "—"}</td>
        <td className="px-4 py-2.5 text-right">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={Boolean(open)}
            className="rounded border border-line-strong px-2 py-1 text-xs text-fg transition-colors hover:border-accent hover:bg-surface-2"
          >
            {open ? "Hide" : row.hasMetadata ? "Details" : "Context"}
          </button>
        </td>
      </tr>
      {open ? (
        <tr className="bg-surface-2/60">
          <td colSpan={6} className="px-4 py-3">
            {open.loading ? (
              <p className="text-xs text-muted">Loading…</p>
            ) : !open.detail ? (
              <p className="text-xs text-red-700 dark:text-red-300">Could not load this event.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-[1fr_minmax(0,2fr)]">
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted">Event id</dt>
                  <dd className="font-mono text-fg">{open.detail.id}</dd>
                  <dt className="text-muted">Request id</dt>
                  <dd className="font-mono text-fg">{open.detail.requestId ?? "—"}</dd>
                  <dt className="text-muted">IP</dt>
                  <dd className="font-mono text-fg">{open.detail.ip ?? "—"}</dd>
                  <dt className="text-muted">User agent</dt>
                  <dd className="break-all text-fg">{open.detail.userAgent ?? "—"}</dd>
                </dl>
                <div>
                  <p className="mb-1 text-xs font-medium text-muted">Metadata</p>
                  <pre className="max-h-72 overflow-auto rounded-lg border border-line bg-surface p-3 font-mono text-[11px] leading-relaxed text-fg">
                    {open.detail.metadata === null || open.detail.metadata === undefined
                      ? "No metadata was recorded for this event."
                      : JSON.stringify(open.detail.metadata, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}
