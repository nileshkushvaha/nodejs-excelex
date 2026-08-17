"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { FilterBar, useFilterBar, type FilterDefinition } from "@/components/filter-bar";
import { ImportDialog } from "@/components/import-dialog";
import { ActiveBadge, MasterTable } from "@/components/master-table";
import type { Destination, StateRow, Zone } from "@/lib/api";
import { deleteDestination } from "./actions";

export function DestinationsManager({
  destinations,
  zones,
  states,
  canManage,
}: {
  destinations: Destination[];
  zones: Zone[];
  states: StateRow[];
  canManage: boolean;
}) {
  const [importing, setImporting] = useState(false);
  const [removeState, removeAction] = useActionState(deleteDestination, null);

  // The fields people actually narrow destinations by. Country, main branch and
  // manifest branch are on the row to be read, not to be filtered on — giving
  // every column a box is what made the legacy grid a wall of empty inputs.
  const definitions = useMemo<ReadonlyArray<FilterDefinition<Destination>>>(
    () => [
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
        key: "kind",
        label: "Type",
        // Domestic and international are different enough that nobody works on
        // both at once, so this one starts set rather than showing everything.
        initial: "DOMESTIC",
        options: [
          { value: "DOMESTIC", label: "Domestic" },
          { value: "INTERNATIONAL", label: "International" },
        ],
        match: (row, value) => row.kind === value,
      },
      {
        kind: "select",
        key: "stateCode",
        label: "State",
        options: states.map((state) => ({ value: state.code, label: state.name })),
        match: (row, value) => row.stateCode === value,
      },
      {
        kind: "select",
        key: "zoneId",
        label: "Zone",
        options: zones.map((zone) => ({ value: zone.id, label: `${zone.code} — ${zone.name}` })),
        match: (row, value) => row.zone?.id === value,
      },
      {
        kind: "select",
        key: "serviceType",
        label: "Service type",
        options: [
          { value: "REGULAR", label: "Regular" },
          { value: "METRO", label: "Metro" },
          { value: "REMOTE", label: "Remote" },
        ],
        match: (row, value) => row.serviceType === value,
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
    ],
    [states, zones],
  );

  const { values, setValues, filtered, active, reset } = useFilterBar(destinations, definitions);

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
        definitions={definitions}
        values={values}
        onChange={setValues}
        active={active}
        onReset={reset}
        total={destinations.length}
        shown={filtered.length}
        noun={{ one: "destination", many: "destinations" }}
        actions={
          <>
            <a
              href={`/api/v1/masters/destinations/export?kind=${values["kind"] ?? ""}`}
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
                <Link
                  href="/network/destinations/new"
                  className="btn-primary rounded-lg px-3 py-2 text-sm font-medium"
                >
                  New destination
                </Link>
              </>
            ) : null}
          </>
        }
      />

      <MasterTable
        rows={filtered}
        rowKey={(row) => row.id}
        empty="No destinations match these filters."
        columns={[
          {
            header: "Destination Code",
            cell: (row) => <span className="font-mono text-xs font-medium text-fg">{row.code}</span>,
          },
          { header: "Destination Name", cell: (row) => <span className="text-fg">{row.name}</span> },
          {
            header: "Country",
            cell: (row) => <span className="text-xs text-muted">{row.countryCode}</span>,
          },
          {
            header: "State",
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
          { header: "Service Type", cell: (row) => <ServiceBadge type={row.serviceType} /> },
          { header: "Status", cell: (row) => <ActiveBadge active={row.isActive} /> },
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
