"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FilterBar, useFilterBar, type FilterDefinition } from "@/components/filter-bar";
import { DataToolbar } from "@/components/data-toolbar";
import { ActiveBadge, MasterTable } from "@/components/master-table";
import type { Zone } from "@/lib/api";
import { deleteZone } from "./actions";

const DEFINITIONS: ReadonlyArray<FilterDefinition<Zone>> = [
  {
    kind: "text",
    key: "search",
    label: "Search",
    placeholder: "Zone code or name…",
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


export function ZonesManager({ zones, canManage }: { zones: Zone[]; canManage: boolean }) {
  const [removeState, removeAction] = useActionState(deleteZone, null);
  const { values, setValues, filtered, active, reset } = useFilterBar(zones, DEFINITIONS);

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
        total={zones.length}
        shown={filtered.length}
        noun={{ one: "zone", many: "zones" }}
        actions={
          <>
            <DataToolbar master="zones" label="Zones" canImport={canManage} />
            {canManage ? (
            <Link href="/geography/zones/new" className="btn-primary rounded-lg px-3 py-2 text-sm font-medium">
                New zone
              </Link>
          ) : null}
          </>
        }
      />

      <MasterTable
        rows={filtered}
        rowKey={(zone) => zone.id}
        empty="No zones match these filters."
        columns={[
          {
            header: "Zone code",
            cell: (zone) => (
              <span className="font-mono text-xs font-medium text-fg">{zone.code}</span>
            ),
          },
          { header: "Zone name", cell: (zone) => <span className="text-fg">{zone.name}</span> },
          { header: "Status", cell: (zone) => <ActiveBadge active={zone.isActive} /> },
          {
            header: "",
            className: "text-right",
            cell: (zone) =>
              canManage ? (
                <span className="flex justify-end gap-2">
                  <Link
                    href={`/geography/zones/${zone.id}`}
                    className="rounded border border-line-strong px-2 py-1 text-xs text-fg transition-colors hover:border-accent hover:bg-surface-2"
                  >
                    Edit
                  </Link>
                  <form action={removeAction}>
                    <input type="hidden" name="id" value={zone.id} />
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
