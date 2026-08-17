"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useActionState, useState } from "react";

import { ImportDialog } from "@/components/import-dialog";
import { ActiveBadge } from "@/components/master-table";
import { PagedTable } from "@/components/paged-table";
import type { Destination, DestinationPage, StateRow, Zone } from "@/lib/api";
import { deleteDestination } from "./actions";

const field =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft";

const SERVICE_TYPES = ["REGULAR", "METRO", "REMOTE"] as const;

export function DestinationsManager({
  data,
  branches,
  zones,
  states,
  canManage,
}: {
  data: DestinationPage;
  branches: Destination[];
  zones: Zone[];
  states: StateRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [importing, setImporting] = useState(false);
  const [removeState, removeAction] = useActionState(deleteDestination, null);

  const kind = params.get("kind") ?? "DOMESTIC";

  function setKind(next: string) {
    const search = new URLSearchParams(params.toString());
    search.set("kind", next);
    search.delete("page");
    router.push(`/network/destinations?${search.toString()}`);
  }

  return (
    <>
      {removeState && !removeState.ok ? (
        <p
          role="alert"
          className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
        >
          {removeState.error}
        </p>
      ) : null}

      <PagedTable
        rows={data.rows}
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        pageCount={data.pageCount}
        basePath="/network/destinations"
        rowKey={(row) => row.id}
        empty="No destinations match. Clear the filters, or import your master."
        toolbar={
          <>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted">Type</span>
              <select value={kind} onChange={(event) => setKind(event.target.value)} className={`${field} w-44`}>
                <option value="DOMESTIC">Domestic</option>
                <option value="INTERNATIONAL">International</option>
              </select>
            </label>

            <span className="flex-1" />

            <a
              href={`/api/v1/masters/destinations/export?kind=${kind}`}
              className="btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
            >
              Export
            </a>

            {canManage ? (
              <>
                <button
                  type="button"
                  onClick={() => setImporting(true)}
                  className="btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
                >
                  Import
                </button>
                <Link href="/network/destinations/new" className="btn-primary rounded-lg px-3 py-2 text-sm font-medium">
                New destination
              </Link>
              </>
            ) : null}
          </>
        }
        columns={[
          {
            header: "Destination Code",
            sortKey: "code",
            filterKey: "code",
            cell: (row) => <span className="font-mono text-xs font-medium text-fg">{row.code}</span>,
          },
          {
            header: "Destination Name",
            sortKey: "name",
            filterKey: "name",
            cell: (row) => <span className="text-fg">{row.name}</span>,
          },
          {
            header: "Country",
            filterKey: "countryCode",
            cell: (row) => <span className="text-xs text-muted">{row.countryCode}</span>,
          },
          {
            header: "State",
            sortKey: "stateCode",
            filterKey: "stateCode",
            cell: (row) => <span className="text-xs text-muted">{row.stateCode ?? "—"}</span>,
          },
          {
            header: "Zone",
            cell: (row) => <span className="text-xs text-muted">{row.zone?.code ?? "—"}</span>,
          },
          {
            header: "Main Branch",
            cell: (row) => (
              <span className="font-mono text-xs text-muted">{row.mainBranch?.code ?? "—"}</span>
            ),
          },
          {
            header: "Service Type",
            sortKey: "serviceType",
            filterKey: "serviceType",
            cell: (row) => <ServiceBadge type={row.serviceType} />,
          },
          {
            header: "Status",
            sortKey: "isActive",
            filterKey: "status",
            cell: (row) => <ActiveBadge active={row.isActive} />,
          },
          {
            header: "Action",
            className: "text-right",
            cell: (row) =>
              canManage ? (
                <span className="flex justify-end gap-2">
                  <Link
                    href={`/network/destinations/${row.id}`}
                    className="rounded border border-line-strong px-2 py-1 text-xs text-fg transition-colors hover:border-accent hover:bg-surface-2"
                  >
                    Edit
                  </Link>
                  <form action={removeAction}>
                    <input type="hidden" name="id" value={row.id} />
                    <button
                      type="submit"
                      aria-label={`Delete ${row.code}`}
                      className="rounded border border-line-strong px-2 py-1 text-xs text-red-700 transition-colors hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/50"
                    >
                      Delete
                    </button>
                  </form>
                </span>
              ) : null,
          },
        ]}
      />

      <ImportDialog
        open={importing}
        onClose={() => setImporting(false)}
        title="Import destinations"
        endpoint="/api/v1/masters/destinations/import"
        templateHref="/api/v1/masters/destinations/import/template"
      />
    </>
  );
}

function ServiceBadge({ type }: { type: "REGULAR" | "METRO" | "REMOTE" }) {
  // Remote is the one that changes what a shipment costs and how long it takes,
  // so it is the one that is allowed to draw the eye.
  const tone = {
    REGULAR: "bg-surface-3 text-muted",
    METRO: "bg-accent-soft text-accent-text",
    REMOTE: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
  }[type];

  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${tone}`}>
      {type}
    </span>
  );
}
