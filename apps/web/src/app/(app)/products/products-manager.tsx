"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { ActiveBadge, MasterTable } from "@/components/master-table";
import type { Classification, Product } from "@/lib/api";
import { deleteProduct } from "./actions";
import { ImportDialog } from "@/components/import-dialog";

const field =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft";

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
  const [importing, setImporting] = useState(false);
  const [removeState, removeAction] = useActionState(deleteProduct, null);

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
        rows={products}
        rowKey={(product) => product.id}
        searchable={(product) =>
          `${product.code} ${product.name} ${product.productType?.name ?? ""} ${product.service ?? ""} ${product.contentKind}`
        }
        placeholder="Search by code, name, type or service…"
        empty="No products yet."
        actions={
          canManage ? (
            <span className="flex gap-2">
              <button
                type="button"
                onClick={() => setImporting(true)}
                className="btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
              >
                Import
              </button>
              <Link href="/products/new" className="btn-primary rounded-lg px-3 py-2 text-sm font-medium">
                New product
              </Link>
            </span>
          ) : null
        }
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

      <ImportDialog open={importing} onClose={() => setImporting(false)} />
    </>
  );
}
