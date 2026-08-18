"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { FilterBar, type FilterDefinition } from "@/components/filter-bar";
import { FormError } from "@/components/form-field";
import { MasterTable } from "@/components/master-table";
import { Pager } from "@/components/pager";
import { StatusPill } from "@/components/status-pill";
import type { ActionResult, ExceptionDetail, ExceptionGroup, ExceptionGroupPage, ExceptionSummary } from "@/lib/api";
import { loadExceptionDetail, setExceptionStatus } from "./actions";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN");
const tone = (status: ExceptionGroup["status"]) => (status === "OPEN" ? "red" : status === "RESOLVED" ? "green" : "slate");

function Tile({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="card relative overflow-hidden rounded-xl p-4">
      <span aria-hidden className="brand-gradient absolute inset-x-0 top-0 h-1 opacity-80" />
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-fg">{value}</p>
      <p className="mt-0.5 text-xs text-faint">{hint}</p>
    </div>
  );
}

export function ExceptionsManager({ page, summary, canManage }: { page: ExceptionGroupPage; summary: ExceptionSummary | null; canManage: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<ExceptionDetail | null>(null);
  const [notice, setNotice] = useState<ActionResult | null>(null);

  const definitions = useMemo<ReadonlyArray<FilterDefinition<ExceptionGroup>>>(
    () => [
      { kind: "text", key: "search", label: "Search", placeholder: "Code, route, exception…", span: 2 },
      { kind: "select", key: "status", label: "Status", options: [{ value: "OPEN", label: "Open" }, { value: "RESOLVED", label: "Resolved" }, { value: "IGNORED", label: "Ignored" }], allLabel: "All" },
      { kind: "select", key: "source", label: "Source", options: [{ value: "http", label: "Requests" }, { value: "job", label: "Jobs" }, { value: "scheduler", label: "Scheduler" }] },
    ],
    [],
  );
  const values = Object.fromEntries(definitions.map((d) => [d.key, params.get(d.key) ?? (d.key === "status" ? "OPEN" : "")]));

  function apply(next: Record<string, string>) {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) query.set(key, value);
      else query.set(key, key === "status" ? "" : "");
      if (!value) query.delete(key);
    }
    if (!("status" in next) && !query.has("status")) query.set("status", "OPEN");
    query.delete("page");
    start(() => router.replace(`${pathname}?${query.toString()}`));
  }

  const act = (fingerprint: string, verb: "resolve" | "ignore" | "reopen") =>
    start(async () => {
      const result = await setExceptionStatus(fingerprint, verb);
      setNotice(result.ok ? null : result);
      if (result.ok && open?.group.fingerprint === fingerprint) setOpen(await loadExceptionDetail(fingerprint));
      router.refresh();
    });

  return (
    <div className="space-y-5">
      {summary ? (
        <section className="grid gap-3 sm:grid-cols-3">
          <Tile label="Open groups" value={summary.openGroups} hint="distinct failures nobody has dealt with" />
          <Tile label="Events · 24 h" value={summary.eventsLast24h} hint={Object.entries(summary.bySource).map(([k, v]) => `${v} ${k}`).join(" · ") || "none"} />
          <Tile label="Active groups · 24 h" value={summary.activeGroupsLast24h} hint="open groups that fired today" />
        </section>
      ) : null}

      <FormError result={notice} />

      <FilterBar
        definitions={definitions}
        values={values}
        onChange={apply}
        active={Boolean(params.get("search") || params.get("source") || (params.get("status") && params.get("status") !== "OPEN"))}
        onReset={() => start(() => router.replace(pathname))}
        total={page.total}
        shown={page.rows.length}
        noun={{ one: "group", many: "groups" }}
      />

      <MasterTable
        rows={page.rows}
        rowKey={(row) => row.id}
        stickyLastColumn={canManage}
        empty="No exceptions match. When something fails on the server it will appear here, grouped by cause."
        columns={[
          { header: "Status", cell: (row) => <StatusPill tone={tone(row.status)}>{row.status.toLowerCase()}{row.regressedAt ? " · regressed" : ""}</StatusPill> },
          {
            header: "Failure",
            cell: (row) => (
              <button type="button" onClick={() => start(async () => setOpen(await loadExceptionDetail(row.fingerprint)))} className="text-left">
                <span className="block text-sm font-medium text-fg">{row.code}</span>
                <span className="block font-mono text-xs text-muted">{row.exceptionName}{row.route ? ` · ${row.route}` : ""}</span>
              </button>
            ),
          },
          { header: "Source", cell: (row) => <span className="text-xs text-muted">{row.source}</span> },
          { header: "Count", cell: (row) => <span className="tabular-nums text-sm">{row.count}</span> },
          { header: "Last seen", cell: (row) => <span className="tabular-nums text-xs">{when(row.lastSeenAt)}</span> },
          { header: "First seen", cell: (row) => <span className="tabular-nums text-xs text-muted">{when(row.firstSeenAt)}</span> },
          ...(canManage
            ? [{
                header: "",
                cell: (row: ExceptionGroup) => (
                  <span className="flex gap-1">
                    {row.status !== "RESOLVED" ? <button type="button" disabled={pending} onClick={() => act(row.fingerprint, "resolve")} className="btn-secondary rounded px-2 py-1 text-xs">Resolve</button> : null}
                    {row.status !== "IGNORED" ? <button type="button" disabled={pending} onClick={() => act(row.fingerprint, "ignore")} className="btn-secondary rounded px-2 py-1 text-xs">Ignore</button> : null}
                    {row.status !== "OPEN" ? <button type="button" disabled={pending} onClick={() => act(row.fingerprint, "reopen")} className="btn-secondary rounded px-2 py-1 text-xs">Reopen</button> : null}
                  </span>
                ),
              }]
            : []),
        ]}
      />
      <Pager page={page.page} pageCount={page.pageCount} total={page.total} pageSize={page.pageSize} />

      {open ? (
        <section className="card rounded-xl">
          <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-5 py-3">
            <div>
              <h2 className="text-sm font-semibold text-fg">{open.group.title}</h2>
              <p className="mt-0.5 text-xs text-muted">
                {open.group.count} occurrence(s) · first {when(open.group.firstSeenAt)} · last {when(open.group.lastSeenAt)} · fingerprint <span className="font-mono">{open.group.fingerprint}</span>
              </p>
            </div>
            <button type="button" onClick={() => setOpen(null)} className="btn-secondary rounded px-2 py-1 text-xs">Close</button>
          </header>
          <div className="space-y-4 p-5">
            {open.perDay.length ? (
              <p className="text-xs text-muted">Last 14 days: {open.perDay.map((d) => `${d.day.slice(5)} ×${d.count}`).join(" · ")}</p>
            ) : null}
            <ul className="divide-y divide-line">
              {open.events.map((event) => (
                <li key={event.id} className="py-3">
                  <p className="text-xs text-muted">
                    <span className="tabular-nums">{when(event.createdAt)}</span>
                    {event.method ? ` · ${event.method} ${event.path ?? ""}` : ""}
                    {event.status ? ` · ${event.status}` : ""}
                    {event.requestId ? <> · reference <span className="font-mono">{event.requestId}</span></> : null}
                    {event.ip ? ` · ${event.ip}` : ""}
                  </p>
                  <p className="mt-1 text-sm text-fg">{event.message}</p>
                  {event.context ? <pre className="mt-1 overflow-auto rounded bg-surface-2 p-2 text-[11px] text-muted">{JSON.stringify(event.context, null, 2)}</pre> : null}
                  {event.stack ? (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-muted">Stack</summary>
                      <pre className="mt-1 max-h-72 overflow-auto rounded bg-surface-2 p-2 text-[11px] leading-relaxed text-muted">{event.stack}</pre>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}
