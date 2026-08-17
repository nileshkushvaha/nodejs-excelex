"use client";

import Link from "next/link";
import { useActionState } from "react";

import { ActiveBadge, MasterTable } from "@/components/master-table";
import type { Destination, ServiceCentre, StateRow } from "@/lib/api";
import { deleteServiceCentre } from "./actions";


export function ServiceCentresManager({
  centres,
  destinations,
  states,
  canManage,
}: {
  centres: ServiceCentre[];
  destinations: Destination[];
  states: StateRow[];
  canManage: boolean;
}) {
  const [removeState, removeAction] = useActionState(deleteServiceCentre, null);

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

      <MasterTable
        rows={centres}
        rowKey={(row) => row.id}
        searchable={(row) => `${row.code} ${row.name} ${row.destination?.code ?? ""} ${row.gstin ?? ""}`}
        placeholder="Search by code, name, branch or GSTIN…"
        empty="No service centres yet."
        actions={
          canManage ? (
            <Link href="/network/service-centres/new" className="btn-primary rounded-lg px-3 py-2 text-sm font-medium">
                New service centre
              </Link>
          ) : null
        }
        columns={[
          {
            header: "Service Centre Code",
            cell: (row) => <span className="font-mono text-xs font-medium text-fg">{row.code}</span>,
          },
          {
            header: "Service Centre Name",
            cell: (row) => (
              <>
                <span className="text-fg">{row.name}</span>
                {row.subName ? (
                  <span className="block text-xs text-muted">{row.subName}</span>
                ) : null}
              </>
            ),
          },
          {
            header: "Branch",
            cell: (row) => (
              <span className="font-mono text-xs text-muted">{row.destination?.code ?? "—"}</span>
            ),
          },
          {
            header: "GSTIN",
            cell: (row) => <span className="font-mono text-xs text-muted">{row.gstin ?? "—"}</span>,
          },
          {
            header: "Next invoice",
            cell: (row) => (
              // The number the next invoice will carry, not the last one issued.
              // "27129" answers a different question from "what comes next".
              <span className="font-mono text-xs tabular-nums text-muted">
                {`${row.invoicePrefix ?? ""}${row.invoiceLastNo + 1}${row.invoiceSuffix ?? ""}`}
              </span>
            ),
          },
          { header: "Status", cell: (row) => <ActiveBadge active={row.isActive} /> },
          {
            header: "",
            className: "text-right",
            cell: (row) =>
              canManage ? (
                <span className="flex justify-end gap-2">
                  <Link
                    href={`/network/service-centres/${row.id}`}
                    className="rounded border border-line-strong px-2 py-1 text-xs text-fg transition-colors hover:border-accent hover:bg-surface-2"
                  >
                    Edit
                  </Link>
                  <form action={removeAction}>
                    <input type="hidden" name="id" value={row.id} />
                    <button
                      type="submit"
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
    </>
  );
}
