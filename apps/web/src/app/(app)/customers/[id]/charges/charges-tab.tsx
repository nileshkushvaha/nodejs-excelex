"use client";

import { Field, FormError, formField } from "@/components/form-field";
import { FormPanel } from "@/components/form-page";
import type { Charge, CustomerChargeRow, Destination, Product } from "@/lib/api";
import { DetailList, useDetailForm } from "../detail-list";
import { saveCustomerCharge } from "../detail-actions";

export function ChargesTab({
  customerId,
  rows,
  charges,
  products,
  destinations,
  canManage,
}: {
  customerId: string;
  rows: CustomerChargeRow[];
  charges: Charge[];
  products: Product[];
  destinations: Destination[];
  canManage: boolean;
}) {
  return (
    <DetailList
      customerId={customerId}
      kind="charges"
      rows={rows}
      canManage={canManage}
      addLabel="Add charge"
      empty="No charges priced for this customer yet."
      columns={[
        { header: "Charge", cell: (row) => <span className="text-fg">{row.charge.name}</span> },
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
          header: "Lane",
          cell: (row) => (
            <span className="font-mono text-xs text-muted">
              {row.origin?.code ?? "All"} → {row.destination?.code ?? "All"}
            </span>
          ),
        },
        {
          header: "Value",
          cell: (row) => (
            // The unit is the point: 50 is fifty rupees or fifty percent, and
            // the row is unreadable without saying which.
            <span className="font-mono text-xs tabular-nums text-fg">
              {row.valueType === "PERCENTAGE" ? `${row.value}%` : `₹${row.value}`}
            </span>
          ),
        },
        {
          header: "Minimum",
          cell: (row) => (
            <span className="font-mono text-xs tabular-nums text-muted">
              {row.minimumValue ?? "—"}
            </span>
          ),
        },
      ]}
      form={({ row, onDone }) => (
        <RowForm
          customerId={customerId}
          row={row}
          charges={charges}
          products={products}
          destinations={destinations}
          onDone={onDone}
        />
      )}
    />
  );
}

function RowForm({
  customerId,
  row,
  charges,
  products,
  destinations,
  onDone,
}: {
  customerId: string;
  row: CustomerChargeRow | null;
  charges: Charge[];
  products: Product[];
  destinations: Destination[];
  onDone: () => void;
}) {
  const { state, submit, pending } = useDetailForm(saveCustomerCharge, onDone);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={submit}>
      <input type="hidden" name="customerId" value={customerId} />
      {row ? <input type="hidden" name="id" value={row.id} /> : null}
      <FormError message={state?.error} />

      <FormPanel title={row ? "Edit charge" : "Charge"}>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Charge" span={2}>
            <select name="chargeId" required defaultValue={row?.charge.id ?? ""} className={formField}>
              <option value="">Select a charge…</option>
              {charges.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} — {row.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="From date">
            <input type="date" name="fromDate" required defaultValue={row?.fromDate ?? today} className={formField} />
          </Field>
          <Field label="To date">
            <input type="date" name="toDate" required defaultValue={row?.toDate ?? today} className={formField} />
          </Field>

          <Field label="Charge type">
            <select name="valueType" defaultValue={row?.valueType ?? "AMOUNT"} className={formField}>
              <option value="AMOUNT">Amount</option>
              <option value="PERCENTAGE">Percentage</option>
            </select>
          </Field>
          <Field label="Value">
            <input name="value" inputMode="decimal" required defaultValue={row?.value ?? "0"} className={`${formField} tabular-nums`} />
          </Field>
          <Field label="Minimum value">
            <input name="minimumValue" inputMode="decimal" defaultValue={row?.minimumValue ?? ""} className={`${formField} tabular-nums`} />
          </Field>
          <Field label="Vendor">
            <input name="vendor" maxLength={120} defaultValue={row?.vendor ?? ""} className={formField} />
          </Field>

          <Field label="Product">
            <select name="productId" defaultValue={row?.product?.id ?? ""} className={formField}>
              <option value="">All products</option>
              {products.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} — {row.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Origin">
            <select name="originId" defaultValue={row?.origin?.id ?? ""} className={formField}>
              <option value="">All origins</option>
              {destinations.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} — {row.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Destination">
            <select name="destinationId" defaultValue={row?.destination?.id ?? ""} className={formField}>
              <option value="">All destinations</option>
              {destinations.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} — {row.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Service">
            <input name="service" maxLength={60} defaultValue={row?.service ?? ""} className={formField} />
          </Field>

          <div className="flex items-end sm:col-start-4">
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
