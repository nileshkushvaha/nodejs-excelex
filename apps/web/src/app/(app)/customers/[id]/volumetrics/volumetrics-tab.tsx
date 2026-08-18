"use client";

import { Field, Form, FormError, formField } from "@/components/form-field";
import { FormPanel } from "@/components/form-page";
import type { CustomerVolumetricRow, Product } from "@/lib/api";
import { DetailList, useDetailForm } from "../detail-list";
import { saveVolumetric } from "../detail-actions";

export function VolumetricsTab({
  customerId,
  rows,
  products,
  canManage,
}: {
  customerId: string;
  rows: CustomerVolumetricRow[];
  products: Product[];
  canManage: boolean;
}) {
  return (
    <DetailList
      customerId={customerId}
      kind="volumetrics"
      rows={rows}
      canManage={canManage}
      addLabel="Add divisor"
      empty="No volumetric divisor agreed. Bookings will use the client default."
      columns={[
        {
          header: "Product",
          cell: (row) => <span className="text-fg">{row.product?.name ?? "All products"}</span>,
        },
        { header: "Vendor", cell: (row) => <span className="text-xs text-muted">{row.vendor ?? "—"}</span> },
        { header: "Service", cell: (row) => <span className="text-xs text-muted">{row.service ?? "—"}</span> },
        {
          header: "CM divide",
          cell: (row) => <span className="font-mono text-xs tabular-nums text-fg">{row.centimetreDivide}</span>,
        },
        {
          header: "Inch divide",
          cell: (row) => <span className="font-mono text-xs tabular-nums text-fg">{row.inchDivide}</span>,
        },
        {
          header: "CFT",
          cell: (row) => <span className="font-mono text-xs tabular-nums text-fg">{row.cft}</span>,
        },
      ]}
      form={({ row, onDone }) => (
        <RowForm customerId={customerId} row={row} products={products} onDone={onDone} />
      )}
    />
  );
}

function RowForm({
  customerId,
  row,
  products,
  onDone,
}: {
  customerId: string;
  row: CustomerVolumetricRow | null;
  products: Product[];
  onDone: () => void;
}) {
  const { state, submit, pending } = useDetailForm(saveVolumetric, onDone);

  return (
    <Form errors={state?.fieldErrors} action={submit}>
      <input type="hidden" name="customerId" value={customerId} />
      {row ? <input type="hidden" name="id" value={row.id} /> : null}
      <FormError result={state} />

      <FormPanel title={row ? "Edit divisor" : "Volumetric divisor"}>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Product" span={2}>
            <select name="productId" defaultValue={row?.product?.id ?? ""} className={formField}>
              <option value="">All products</option>
              {products.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} — {row.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Vendor">
            <input name="vendor" maxLength={120} defaultValue={row?.vendor ?? ""} className={formField} />
          </Field>
          <Field label="Service">
            <input name="service" maxLength={60} defaultValue={row?.service ?? ""} className={formField} />
          </Field>

          <Field label="Centimetre divide" hint="Zero means not agreed.">
            <input name="centimetreDivide" inputMode="decimal" required defaultValue={row?.centimetreDivide ?? "0"} className={`${formField} tabular-nums`} />
          </Field>
          <Field label="Inch divide">
            <input name="inchDivide" inputMode="decimal" required defaultValue={row?.inchDivide ?? "0"} className={`${formField} tabular-nums`} />
          </Field>
          <Field label="CFT">
            <input name="cft" inputMode="decimal" required defaultValue={row?.cft ?? "0"} className={`${formField} tabular-nums`} />
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
    </Form>
  );
}
