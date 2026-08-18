"use client";

import { Field, FormError, formField } from "@/components/form-field";
import { FormPanel } from "@/components/form-page";
import type { CustomerFuelSurchargeRow, Destination, Product } from "@/lib/api";
import { DetailList, useDetailForm } from "../detail-list";
import { saveFuelSurcharge } from "../detail-actions";

export function FuelSurchargesTab({
  customerId,
  rows,
  products,
  destinations,
  canManage,
}: {
  customerId: string;
  rows: CustomerFuelSurchargeRow[];
  products: Product[];
  destinations: Destination[];
  canManage: boolean;
}) {
  return (
    <DetailList
      customerId={customerId}
      kind="fuel-surcharges"
      rows={rows}
      canManage={canManage}
      addLabel="Add surcharge"
      empty="No fuel surcharge agreed with this customer yet."
      columns={[
        {
          header: "From",
          cell: (row) => <span className="text-xs tabular-nums text-muted">{row.fromDate}</span>,
        },
        {
          header: "To",
          cell: (row) => <span className="text-xs tabular-nums text-muted">{row.toDate}</span>,
        },
        { header: "Vendor", cell: (row) => <span className="text-xs text-muted">{row.vendor ?? "—"}</span> },
        {
          header: "Product",
          cell: (row) => <span className="text-xs text-muted">{row.product?.code ?? "All"}</span>,
        },
        {
          header: "Destination",
          cell: (row) => <span className="text-xs text-muted">{row.destination?.code ?? "All"}</span>,
        },
        { header: "Service", cell: (row) => <span className="text-xs text-muted">{row.service ?? "—"}</span> },
        {
          header: "Percentage",
          cell: (row) => (
            // Rendered as stored. Formatting it through a JavaScript number
            // would undo the exactness the column exists for.
            <span className="font-mono text-xs tabular-nums text-fg">{row.percentage}%</span>
          ),
        },
      ]}
      form={({ onDone }) => (
        <AddForm
          customerId={customerId}
          products={products}
          destinations={destinations}
          onDone={onDone}
        />
      )}
    />
  );
}

function AddForm({
  customerId,
  products,
  destinations,
  onDone,
}: {
  customerId: string;
  products: Product[];
  destinations: Destination[];
  onDone: () => void;
}) {
  const { state, submit, pending } = useDetailForm(saveFuelSurcharge, onDone);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={submit}>
      <input type="hidden" name="customerId" value={customerId} />
      <FormError message={state?.error} />

      <FormPanel title="Fuel surcharge">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="From date">
            <input type="date" name="fromDate" required defaultValue={today} className={formField} />
          </Field>
          <Field label="To date">
            <input type="date" name="toDate" required defaultValue={today} className={formField} />
          </Field>
          <Field label="Percentage">
            <input
              name="percentage"
              inputMode="decimal"
              required
              defaultValue="0"
              className={`${formField} tabular-nums`}
            />
          </Field>
          <Field label="Vendor">
            <input name="vendor" maxLength={120} className={formField} />
          </Field>

          <Field label="Product" hint="Leave blank to cover every product.">
            <select name="productId" className={formField}>
              <option value="">All products</option>
              {products.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} — {row.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Destination">
            <select name="destinationId" className={formField}>
              <option value="">All destinations</option>
              {destinations.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} — {row.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Service">
            <input name="service" maxLength={60} className={formField} />
          </Field>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={pending}
              className="btn-primary w-full rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </FormPanel>
    </form>
  );
}
