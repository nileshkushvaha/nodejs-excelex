"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FilterBar, useFilterBar, type FilterDefinition } from "@/components/filter-bar";
import { DataToolbar } from "@/components/data-toolbar";
import { ActiveBadge, MasterTable } from "@/components/master-table";
import type { SalesExecutive } from "@/lib/api";
import { deleteSalesExecutive } from "./actions";

const DEFINITIONS: ReadonlyArray<FilterDefinition<SalesExecutive>> = [
  {
    kind: "text",
    key: "search",
    label: "Search",
    placeholder: "Code, name, email or mobile…",
    span: 3,
    match: (row) => `${row.code} ${row.name} ${row.email ?? ""} ${row.mobile ?? ""}`,
  },
  {
    kind: "select",
    key: "status",
    label: "Status",
    options: [
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
    ],
    match: (row, value) => row.isActive === (value === "active"),
  },
];

export function SalesExecutivesManager({
  executives,
  canManage,
}: {
  executives: SalesExecutive[];
  canManage: boolean;
}) {
  const [removeState, removeAction] = useActionState(deleteSalesExecutive, null);
  const { values, setValues, filtered, active, reset } = useFilterBar(executives, DEFINITIONS);

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

      <FilterBar
        definitions={DEFINITIONS}
        values={values}
        onChange={setValues}
        active={active}
        onReset={reset}
        total={executives.length}
        shown={filtered.length}
        noun={{ one: "sales executive", many: "sales executives" }}
        actions={
          <>
            <DataToolbar master="sales-executives" label="Sales executives" canImport={canManage} />
            {canManage ? (
            <Link
              href="/organisation/sales-executives/new"
              className="btn-primary rounded-lg px-3 py-2 text-sm font-medium"
            >
              New sales executive
            </Link>
          ) : null}
          </>
        }
      />

      <MasterTable
        rows={filtered}
        rowKey={(row) => row.id}
        empty="No sales executives match these filters."
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
