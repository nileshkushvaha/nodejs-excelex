"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FilterBar, useFilterBar, type FilterDefinition } from "@/components/filter-bar";
import { ActiveBadge, MasterTable } from "@/components/master-table";
import type { Charge } from "@/lib/api";
import { deleteCharge } from "./actions";
import { CALCULATION_BASES, CHARGE_TYPES, calculationBaseLabel, chargeTypeLabel } from "./labels";

const DEFINITIONS: ReadonlyArray<FilterDefinition<Charge>> = [
  {
    kind: "text",
    key: "search",
    label: "Search",
    placeholder: "Code, name or HSN…",
    span: 3,
    match: (row) => `${row.code} ${row.name} ${row.hsnCode ?? ""}`,
  },
  {
    kind: "select",
    key: "chargeType",
    label: "Charge type",
    options: CHARGE_TYPES.map((entry) => ({ value: entry.value, label: entry.label })),
    match: (row, value) => row.chargeType === value,
  },
  {
    kind: "select",
    key: "calculationBase",
    label: "Base on",
    options: CALCULATION_BASES.map((entry) => ({ value: entry.value, label: entry.label })),
    match: (row, value) => row.calculationBase === value,
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

export function ChargesManager({
  charges,
  canManage,
}: {
  charges: Charge[];
  canManage: boolean;
}) {
  const [removeState, removeAction] = useActionState(deleteCharge, null);
  const { values, setValues, filtered, active, reset } = useFilterBar(charges, DEFINITIONS);

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
        total={charges.length}
        shown={filtered.length}
        noun={{ one: "charge", many: "charges" }}
        actions={
          canManage ? (
            <Link href="/rates/charges/new" className="btn-primary rounded-lg px-3 py-2 text-sm font-medium">
              New charge
            </Link>
          ) : null
        }
      />

      <MasterTable
        rows={filtered}
        rowKey={(row) => row.id}
        empty="No charges match these filters."
        columns={[
          {
            header: "Code",
            cell: (row) => <span className="font-mono text-xs font-medium text-fg">{row.code}</span>,
          },
          {
            header: "Name",
            cell: (row) => (
              <>
                <span className="text-fg">{row.name}</span>
                {row.components.length > 0 ? (
                  <span className="block text-xs text-muted">
                    Includes {row.components.map((component) => component.code).join(", ")}
                  </span>
                ) : null}
              </>
            ),
          },
          {
            header: "Type",
            cell: (row) => <span className="text-xs text-muted">{chargeTypeLabel(row.chargeType)}</span>,
          },
          {
            header: "Base on",
            cell: (row) => (
              <span className="text-xs text-muted">{calculationBaseLabel(row.calculationBase)}</span>
            ),
          },
          {
            header: "Rate",
            className: "text-right",
            cell: (row) => (
              // Rendered as stored. Formatting it through a JavaScript number
              // would undo the exactness the column exists for.
              <span className="block text-right font-mono text-xs tabular-nums text-muted">
                {row.rate}
              </span>
            ),
          },
          {
            header: "Applies",
            cell: (row) => (
              <span className="flex gap-1 text-[10px] uppercase">
                <Applies on={row.applyFuel} label="fuel" title="Fuel surcharge applies" />
                <Applies on={row.applyTaxOnFuel} label="tax/fuel" title="Tax applies to the fuel component" />
                <Applies on={row.applyTax} label="tax" title="Tax applies to this charge" />
              </span>
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
                    href={`/rates/charges/${row.id}`}
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

/**
 * Three flags in one column. Only what applies is shown — a row of "No" badges
 * is noise, and the absence is the same information.
 */
function Applies({ on, label, title }: { on: boolean; label: string; title: string }) {
  if (!on) return null;
  return (
    <span className="rounded bg-accent-soft px-1 py-0.5 text-accent-text" title={title}>
      {label}
    </span>
  );
}
