"use client";

import Link from "next/link";
import { useActionState } from "react";

import { ActiveBadge, MasterTable } from "@/components/master-table";
import type { SalesExecutive } from "@/lib/api";
import { deleteSalesExecutive } from "./actions";

export function SalesExecutivesManager({
  executives,
  canManage,
}: {
  executives: SalesExecutive[];
  canManage: boolean;
}) {
  const [removeState, removeAction] = useActionState(deleteSalesExecutive, null);

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
        rows={executives}
        rowKey={(row) => row.id}
        searchable={(row) => `${row.code} ${row.name} ${row.email ?? ""}`}
        placeholder="Search by code, name or email…"
        empty="No sales executives yet."
        actions={
          canManage ? (
            <Link
              href="/organisation/sales-executives/new"
              className="btn-primary rounded-lg px-3 py-2 text-sm font-medium"
            >
              New sales executive
            </Link>
          ) : null
        }
        columns={[
          {
            header: "Sales Ex. Code",
            cell: (row) => <span className="font-mono text-xs font-medium text-fg">{row.code}</span>,
          },
          { header: "Sales Ex. Name", cell: (row) => <span className="text-fg">{row.name}</span> },
          {
            header: "Commission",
            cell: (row) => (
              // Rendered as stored. Formatting it through a JavaScript number
              // would undo the exactness the column exists for.
              <span className="font-mono text-xs tabular-nums text-muted">
                {row.commissionPercent}%
              </span>
            ),
          },
          {
            header: "Contact",
            cell: (row) => (
              <span className="text-xs text-muted">{row.email ?? row.mobile ?? "—"}</span>
            ),
          },
          { header: "Status", cell: (row) => <ActiveBadge active={row.isActive} /> },
          {
            header: "Action",
            className: "text-right",
            cell: (row) =>
              canManage ? (
                <span className="flex justify-end gap-2">
                  <Link
                    href={`/organisation/sales-executives/${row.id}`}
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
