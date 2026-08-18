"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FilterBar, useFilterBar, type FilterDefinition } from "@/components/filter-bar";
import { DataToolbar } from "@/components/data-toolbar";
import { ActiveBadge, MasterTable } from "@/components/master-table";
import type { Classification } from "@/lib/api";
import { deleteProductType } from "./actions";

const DEFINITIONS: ReadonlyArray<FilterDefinition<Classification>> = [
  {
    kind: "text",
    key: "search",
    label: "Search",
    placeholder: "Code or name…",
    span: 3,
    match: (row) => `${row.code} ${row.name}`,
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

export function ProductTypesManager({
  types,
  canManage,
}: {
  types: Classification[];
  canManage: boolean;
}) {
  const [removeState, removeAction] = useActionState(deleteProductType, null);
  const { values, setValues, filtered, active, reset } = useFilterBar(types, DEFINITIONS);

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
        total={types.length}
        shown={filtered.length}
        noun={{ one: "product type", many: "product types" }}
        actions={
          <>
            <DataToolbar master="product-types" label="Product types" canImport={canManage} />
            {canManage ? (
            <Link
              href="/products/types/new"
              className="btn-primary rounded-lg px-3 py-2 text-sm font-medium"
            >
              New product type
            </Link>
          ) : null}
          </>
        }
      />

      <MasterTable
        rows={filtered}
        rowKey={(row) => row.id}
        empty="No product types match these filters."
        columns={[
          {
            header: "Code",
            cell: (row) => <span className="font-mono text-xs font-medium text-fg">{row.code}</span>,
          },
          { header: "Name", cell: (row) => <span className="text-fg">{row.name}</span> },
          {
            header: "Products",
            cell: (row) => (
              // What makes a type deletable or not, so it belongs on the row
              // rather than only in the error you get for trying.
              <span className="text-xs tabular-nums text-muted">{row.productCount}</span>
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
                    href={`/products/types/${row.id}`}
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
    </>
  );
}
