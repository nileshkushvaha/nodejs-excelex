"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActionState, useMemo, useState, useTransition } from "react";

import { FilterBar, type FilterDefinition } from "@/components/filter-bar";
import { FormError } from "@/components/form-field";
import { ImportDialog } from "@/components/import-dialog";
import { ActiveBadge, MasterTable } from "@/components/master-table";
import { Pager } from "@/components/pager";
import type { Destination, Rate, RatePage } from "@/lib/api";
import { deleteRate } from "./actions";

type Option = { id: string; code: string; name: string };

/**
 * Rate cards.
 *
 * Read, searched and retired here; created by import. A courier's tariff is
 * thousands of lines maintained in a spreadsheet by whoever negotiated it,
 * and a form to type them in would be a worse copy of a file that already
 * exists.
 */
export function RatesManager({
  page,
  customers,
  products,
  destinations,
  canManage,
}: {
  page: RatePage;
  customers: Option[];
  products: Option[];
  destinations: Destination[];
  canManage: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [importing, setImporting] = useState(params.get("import") === "1");
  const [removeState, removeAction] = useActionState(deleteRate, null);

  const definitions = useMemo<ReadonlyArray<FilterDefinition<Rate>>>(
    () => [
      {
        kind: "select",
        key: "customerId",
        label: "Customer",
        options: customers.map((row) => ({ value: row.id, label: `${row.code} — ${row.name}` })),
      },
      {
        kind: "select",
        key: "originId",
        label: "Origin",
        options: destinations.map((row) => ({ value: row.id, label: `${row.code} — ${row.name}` })),
      },
      {
        kind: "select",
        key: "destinationId",
        label: "Destination",
        options: destinations.map((row) => ({ value: row.id, label: `${row.code} — ${row.name}` })),
      },
      {
        kind: "select",
        key: "productId",
        label: "Product",
        options: products.map((row) => ({ value: row.id, label: `${row.code} — ${row.name}` })),
      },
      {
        kind: "text",
        key: "on",
        label: "In force on",
        placeholder: "yyyy-mm-dd",
      },
    ],
    [customers, destinations, products],
  );

  const values = Object.fromEntries(
    definitions.map((definition) => [definition.key, params.get(definition.key) ?? ""]),
  );

  function apply(next: Record<string, string>) {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    query.delete("page");
    startTransition(() => router.replace(`${pathname}?${query.toString()}`));
  }

  return (
    <>
      <FormError message={removeState?.ok === false ? removeState.error : undefined} />

      <FilterBar
        definitions={definitions}
        values={values}
        onChange={apply}
        active={Object.values(values).some((value) => value !== "")}
        onReset={() => startTransition(() => router.replace(pathname))}
        total={page.total}
        shown={page.rows.length}
        noun={{ one: "rate card", many: "rate cards" }}
        actions={
          <>
            <a
              href={`/api/v1/masters/rates/export?${params.toString()}`}
              className="btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
            >
              Export
            </a>
            {canManage ? (
              <button
                type="button"
                onClick={() => setImporting(true)}
                className="btn-primary rounded-lg px-3 py-2 text-sm font-medium"
              >
                Import rates
              </button>
            ) : null}
          </>
        }
      />

      <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <MasterTable
          rows={page.rows}
          rowKey={(row) => row.id}
          empty="No rate cards yet. Import your tariff to get started."
          columns={[
            {
              header: "From",
              cell: (row) => (
                <>
                  <span className="text-xs tabular-nums text-fg">{row.effectiveFrom}</span>
                  {row.effectiveTo ? (
                    <span className="block text-xs tabular-nums text-muted">to {row.effectiveTo}</span>
                  ) : null}
                </>
              ),
            },
            {
              header: "Customer",
              cell: (row) =>
                row.customer ? (
                  <span className="text-fg">{row.customer.name}</span>
                ) : (
                  // A blank is the standard tariff, not a missing value.
                  <span className="text-xs italic text-faint">Standard</span>
                ),
            },
            {
              header: "Lane",
              cell: (row) => (
                <span className="font-mono text-xs text-muted">
                  {row.origin?.code ?? "Any"} → {row.destination?.code ?? row.zone?.code ?? "Any"}
                </span>
              ),
            },
            {
              header: "Product",
              cell: (row) => <span className="text-xs text-muted">{row.product?.code ?? "Any"}</span>,
            },
            {
              header: "Vendor",
              cell: (row) => <span className="text-xs text-muted">{row.vendor ?? "—"}</span>,
            },
            {
              header: "Tariff",
              cell: (row) => (
                // The first two lines, because they are what somebody checks:
                // the entry price and the step above it.
                <span className="font-mono text-xs text-muted">
                  {row.lines.length === 0
                    ? "—"
                    : row.lines
                        .slice(0, 2)
                        .map((line) => `${line.lineType} ${line.weight} @ ${line.rate}`)
                        .join(", ")}
                  {row.lines.length > 2 ? ` +${row.lines.length - 2}` : ""}
                </span>
              ),
            },
            {
              header: "Unit",
              cell: (row) => (
                <span className="text-xs text-muted">
                  {row.unit === "LBS" ? "Lbs" : "Kgs"}
                  {row.days === null ? "" : ` · ${row.days}d`}
                </span>
              ),
            },
            { header: "Status", cell: (row) => <ActiveBadge active={row.isActive} /> },
            {
              header: "Action",
              className: "text-right",
              cell: (row) =>
                canManage ? (
                  <form action={removeAction} className="flex justify-end">
                    <input type="hidden" name="id" value={row.id} />
                    <button
                      type="submit"
                      aria-label={`Retire the rate effective ${row.effectiveFrom}`}
                      className="rounded border border-line-strong px-2 py-1 text-xs text-red-700 transition-colors hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/50"
                    >
                      Retire
                    </button>
                  </form>
                ) : null,
            },
          ]}
        />
      </div>

      <Pager page={page.page} pageCount={page.pageCount} total={page.total} pageSize={page.pageSize} />

      <ImportDialog
        open={importing}
        onClose={() => setImporting(false)}
        title="Import rates"
        endpoint="/api/v1/masters/rates/import"
        templateHref="/api/v1/masters/rates/import/template"
      />
    </>
  );
}
