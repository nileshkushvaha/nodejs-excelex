"use client";

import Link from "next/link";
import { useActionState, useMemo } from "react";

import { FilterBar, useFilterBar, type FilterDefinition } from "@/components/filter-bar";
import { DataToolbar } from "@/components/data-toolbar";
import { ActiveBadge, MasterTable } from "@/components/master-table";
import type { Classification, Product } from "@/lib/api";
import { deleteProduct } from "./actions";


export function ProductsManager({
  products,
  types,
  groups,
  canManage,
}: {
  products: Product[];
  types: Classification[];
  groups: Classification[];
  canManage: boolean;
}) {
  const [removeState, removeAction] = useActionState(deleteProduct, null);

  const definitions = useMemo<ReadonlyArray<FilterDefinition<Product>>>(
    () => [
      {
        kind: "text",
        key: "search",
        label: "Search",
        placeholder: "Code, name or service…",
        span: 3,
        match: (row) => `${row.code} ${row.name} ${row.service ?? ""}`,
      },
      {
        kind: "select",
        key: "productTypeId",
        label: "Type",
        options: types.map((type) => ({ value: type.id, label: type.name })),
        match: (row, value) => row.productType?.id === value,
      },
      {
        kind: "select",
        key: "productGroupId",
        label: "Group",
        options: groups.map((group) => ({ value: group.id, label: group.name })),
        match: (row, value) => row.productGroup?.id === value,
      },
      {
        kind: "select",
        key: "contentKind",
        label: "Content",
        options: [
          { value: "DOX", label: "Documents" },
          { value: "NDOX", label: "Non-documents" },
        ],
        match: (row, value) => row.contentKind === value,
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
    [groups, types],
  );

  const { values, setValues, filtered, active, reset } = useFilterBar(products, definitions);

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
        total={products.length}
        shown={filtered.length}
        noun={{ one: "product", many: "products" }}
        actions={
          <>
            <DataToolbar master="products" label="Products" canImport={canManage} />
            {canManage ? (
              <Link href="/products/new" className="btn-primary rounded-lg px-3 py-2 text-sm font-medium">
                New product
              </Link>
            ) : null}
          </>
        }
      />

      <MasterTable
        rows={filtered}
        rowKey={(product) => product.id}
        empty="No products match these filters."
        columns={[
          {
            header: "Code",
            cell: (product) => (
              <span className="font-mono text-xs font-medium text-fg">{product.code}</span>
            ),
          },
          {
            header: "Product name",
            cell: (product) => <span className="text-fg">{product.name}</span>,
          },
          {
            header: "Type",
            cell: (product) => (
              <span className="text-xs text-muted">{product.productType?.name ?? "—"}</span>
            ),
          },
          {
            header: "Group",
            cell: (product) => (
              <span className="text-xs text-muted">{product.productGroup?.name ?? "—"}</span>
            ),
          },
          {
            header: "Service",
            cell: (product) => (
              <span className="text-xs text-muted">{product.service ?? "—"}</span>
            ),
          },
          {
            header: "Content",
            cell: (product) => (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  product.contentKind === "DOX"
                    ? "bg-accent-soft text-accent-text"
                    : "bg-surface-3 text-muted"
                }`}
                title={product.contentKind === "DOX" ? "Documents" : "Non-documents"}
              >
                {product.contentKind}
              </span>
            ),
          },
          {
            header: "Charges",
            cell: (product) => (
              <span className="flex gap-1 text-[10px] uppercase">
                {product.fuelCharge ? (
                  <span className="rounded bg-surface-3 px-1 py-0.5 text-muted" title="Fuel surcharge applies">
                    fuel
                  </span>
                ) : null}
                {product.gstReverse ? (
                  <span
                    className="rounded bg-amber-100 px-1 py-0.5 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300"
                    title="Recipient accounts for GST"
                  >
                    rcm
                  </span>
                ) : null}
              </span>
            ),
          },
          { header: "Status", cell: (product) => <ActiveBadge active={product.isActive} /> },
          {
            header: "",
            className: "text-right",
            cell: (product) =>
              canManage ? (
                <span className="flex justify-end gap-2">
                  <Link
                    href={`/products/${product.id}`}
                    className="rounded border border-line-strong px-2 py-1 text-xs text-fg hover:bg-surface-2"
                  >
                    Edit
                  </Link>
                  <form action={removeAction}>
                    <input type="hidden" name="id" value={product.id} />
                    <button
                      type="submit"
                      className="rounded border border-line-strong px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/50"
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
