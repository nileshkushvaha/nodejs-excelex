"use client";

import { useActionState, useEffect, useState } from "react";

import { MasterDialog } from "@/components/master-dialog";
import { ActiveBadge, MasterTable } from "@/components/master-table";
import { Toggle } from "@/components/toggle";
import type { Classification, Product } from "@/lib/api";
import { deleteProduct, saveProduct } from "./actions";
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
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
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
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="btn-primary rounded-lg px-3 py-2 text-sm font-medium"
              >
                New product
              </button>
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
                  <button
                    type="button"
                    onClick={() => setEditing(product)}
                    className="rounded border border-line-strong px-2 py-1 text-xs text-fg hover:bg-surface-2"
                  >
                    Edit
                  </button>
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

      <ProductDialog
        key={editing?.id ?? "new"}
        open={creating || editing !== null}
        product={editing}
        types={types}
        groups={groups}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </>
  );
}

function ProductDialog({
  open,
  product,
  types,
  groups,
  onClose,
}: {
  open: boolean;
  product: Product | null;
  types: Classification[];
  groups: Classification[];
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(saveProduct, null);
  const [contentKind, setContentKind] = useState<"DOX" | "NDOX">(product?.contentKind ?? "NDOX");

  // Closing on success rather than on submit: a rejected save has to leave the
  // dialog open with its message, or the reason disappears with it.
  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <MasterDialog
      open={open}
      onClose={onClose}
      title={product ? `Edit ${product.code}` : "New product"}
      description="A sellable service. Shipments are booked against one of these."
    >
      <form action={action} className="space-y-4">
        {product ? <input type="hidden" name="id" value={product.id} /> : null}
        <input type="hidden" name="contentKind" value={contentKind} />

        {state && !state.ok ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
          >
            {state.error}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-fg">Product code</span>
            <input
              name="code"
              required
              minLength={2}
              maxLength={20}
              pattern="[A-Za-z0-9\-]+"
              defaultValue={product?.code}
              placeholder="SFC"
              className={`${field} font-mono uppercase`}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-fg">Product name</span>
            <input
              name="name"
              required
              minLength={2}
              maxLength={120}
              defaultValue={product?.name}
              placeholder="Surface"
              className={field}
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-fg">Product type</span>
            <select
              name="productTypeId"
              defaultValue={product?.productType?.id ?? ""}
              className={field}
            >
              <option value="">Not set</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-fg">Group type</span>
            <select
              name="productGroupId"
              defaultValue={product?.productGroup?.id ?? ""}
              className={field}
            >
              <option value="">Not set</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-fg">Product service</span>
            <input
              name="service"
              maxLength={40}
              defaultValue={product?.service ?? ""}
              placeholder="SELF"
              className={`${field} uppercase`}
            />
          </label>
        </div>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-fg">Content</legend>
          <div
            role="radiogroup"
            aria-label="Content kind"
            className="inline-flex overflow-hidden rounded-lg border border-line-strong"
          >
            {(["DOX", "NDOX"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={contentKind === kind}
                onClick={() => setContentKind(kind)}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                  contentKind === kind
                    ? "brand-gradient text-white"
                    : "bg-surface text-muted hover:bg-surface-2"
                }`}
              >
                {kind}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">
            Documents or non-documents. It belongs to the product rather than the type — DOX and SPX
            are both International and differ only here — and it drives rating, packaging and
            customs paperwork.
          </p>
        </fieldset>

        <div className="space-y-3 border-t border-line-soft pt-4">
          <Toggle
            name="fuelCharge"
            label="Fuel surcharge applies"
            description="Turn off for all-inclusive quotes such as port-to-port, which must not attract it on top."
            defaultChecked={product?.fuelCharge ?? true}
          />
          <Toggle
            name="gstReverse"
            label="GST reverse charge"
            description="The recipient accounts for GST instead of the supplier."
            defaultChecked={product?.gstReverse ?? false}
          />
          <Toggle
            name="isActive"
            label="Active"
            description="Inactive products stay on historic shipments but are not offered when booking."
            defaultChecked={product?.isActive ?? true}
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {pending ? "Saving…" : product ? "Save changes" : "Create product"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary rounded-lg px-4 py-2 text-sm font-medium"
          >
            Close
          </button>
        </div>
      </form>
    </MasterDialog>
  );
}
