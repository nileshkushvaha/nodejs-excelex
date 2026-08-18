"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { AutoRefresh } from "@/components/auto-refresh";
import { FilterBar, type FilterDefinition } from "@/components/filter-bar";
import { FormError } from "@/components/form-field";
import { MasterTable } from "@/components/master-table";
import { Pager } from "@/components/pager";
import { StatusPill } from "@/components/status-pill";
import type { ActionResult, AdminSession, AdminSessionPage, AdminSessionSummary } from "@/lib/api";
import { revokeAllSessions, revokeSession } from "./actions";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN");
const ago = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
};

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

export function ActiveSessionsManager({ page, summary }: { page: AdminSessionPage; summary: AdminSessionSummary | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<ActionResult | null>(null);

  const definitions = useMemo<ReadonlyArray<FilterDefinition<AdminSession>>>(
    () => [{ kind: "text", key: "search", label: "Search", placeholder: "Name, email or IP address…", span: 3 }],
    [],
  );
  const values = { search: params.get("search") ?? "" };

  function apply(next: Record<string, string>) {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    query.delete("page");
    start(() => router.replace(`${pathname}?${query.toString()}`));
  }

  const run = (action: () => Promise<ActionResult>, confirmText: string) => {
    if (!window.confirm(confirmText)) return;
    start(async () => {
      const result = await action();
      setNotice(result.ok ? null : result);
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      <AutoRefresh intervalMs={30_000} />
      {summary ? (
        <section className="grid gap-3 sm:grid-cols-3">
          <Tile label="Live sessions" value={summary.activeSessions} hint="devices with a valid session" />
          <Tile label="People signed in" value={summary.signedInUsers} hint="distinct accounts" />
          <Tile label="Signed in · last hour" value={summary.signedInLastHour} hint="new sessions" />
        </section>
      ) : null}

      <FormError result={notice} />

      <FilterBar
        definitions={definitions}
        values={values}
        onChange={apply}
        active={Boolean(params.get("search"))}
        onReset={() => start(() => router.replace(pathname))}
        total={page.total}
        shown={page.rows.length}
        noun={{ one: "session", many: "sessions" }}
      />

      <MasterTable
        rows={page.rows}
        rowKey={(row) => row.id}
        empty="Nobody is signed in — or nobody who matches."
        columns={[
          {
            header: "Person",
            cell: (row) => (
              <span>
                <span className="block text-sm font-medium text-fg">
                  {row.user?.fullName ?? "Unknown"} {row.isSelf ? <StatusPill tone="slate">you</StatusPill> : null}
                </span>
                <span className="block text-xs text-muted">{row.user?.email}</span>
              </span>
            ),
          },
          {
            header: "Device",
            cell: (row) => (
              <span className="text-xs" title={row.userAgent ?? ""}>
                {row.device ? `${row.device.browser} · ${row.device.os}` : "unknown"}
              </span>
            ),
          },
          { header: "IP", cell: (row) => <span className="font-mono text-xs">{row.ip ?? "—"}</span> },
          {
            header: "Last active",
            // Relative time is computed at render and differs by the seconds
            // between the server's render and the browser's; the absolute
            // time is in the title, and this text is allowed to differ.
            cell: (row) => <span className="text-xs tabular-nums" title={when(row.lastActiveAt)} suppressHydrationWarning>{ago(row.lastActiveAt)}</span>,
          },
          { header: "Signed in", cell: (row) => <span className="text-xs tabular-nums">{when(row.signedInAt)}</span> },
          { header: "Ends by", cell: (row) => <span className="text-xs tabular-nums text-muted">{when(row.absoluteExpiry)}</span> },
          {
            header: "",
            cell: (row) => (
              <span className="flex gap-1">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => revokeSession(row.id), `Sign this device out${row.isSelf ? " (this is one of your own sessions)" : ""}?`)}
                  className="btn-secondary rounded px-2 py-1 text-xs"
                >
                  Sign out
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => revokeAllSessions(row.userId), `Sign ${row.user?.fullName ?? "this person"} out of every device?`)}
                  className="btn-secondary rounded px-2 py-1 text-xs"
                >
                  All devices
                </button>
              </span>
            ),
          },
        ]}
      />
      <Pager page={page.page} pageCount={page.pageCount} total={page.total} pageSize={page.pageSize} />
    </div>
  );
}
