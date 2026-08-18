"use client";

import { Field, FormError, formField } from "@/components/form-field";
import { FormPanel } from "@/components/form-page";
import { Toggle } from "@/components/toggle";
import type { CustomerContactRow, StateRow } from "@/lib/api";
import { DetailList, useDetailForm } from "../detail-list";
import { saveContact } from "../detail-actions";

export function ContactsTab({
  customerId,
  rows,
  states,
  canManage,
}: {
  customerId: string;
  rows: CustomerContactRow[];
  states: StateRow[];
  canManage: boolean;
}) {
  return (
    <DetailList
      customerId={customerId}
      kind="contacts"
      rows={rows}
      canManage={canManage}
      addLabel="Add contact"
      empty="No contacts recorded for this customer yet."
      columns={[
        {
          header: "Contact person",
          cell: (row) => (
            <>
              <span className="text-fg">{row.name}</span>
              {row.defaultShipper ? (
                // The one that a booking will pick up by default, so it is
                // worth seeing without opening the row.
                <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent-text">
                  Default
                </span>
              ) : null}
            </>
          ),
        },
        { header: "Type", cell: (row) => <span className="text-xs text-muted">{row.contactType}</span> },
        {
          header: "From",
          cell: (row) => <span className="text-xs tabular-nums text-muted">{row.fromDate}</span>,
        },
        {
          header: "Designation",
          cell: (row) => <span className="text-xs text-muted">{row.designation ?? "—"}</span>,
        },
        {
          header: "Mobile",
          cell: (row) => <span className="font-mono text-xs tabular-nums text-muted">{row.mobile}</span>,
        },
        { header: "City", cell: (row) => <span className="text-xs text-muted">{row.city ?? "—"}</span> },
      ]}
      form={({ onDone }) => <AddForm customerId={customerId} states={states} onDone={onDone} />}
    />
  );
}

function AddForm({
  customerId,
  states,
  onDone,
}: {
  customerId: string;
  states: StateRow[];
  onDone: () => void;
}) {
  const { state, submit, pending } = useDetailForm(saveContact, onDone);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={submit}>
      <input type="hidden" name="customerId" value={customerId} />
      <FormError message={state?.error} />

      <FormPanel title="Contact">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Contact type" hint="Billing, pickup, escalation.">
            <input name="contactType" required maxLength={60} className={formField} />
          </Field>
          <Field label="From date">
            <input type="date" name="fromDate" required defaultValue={today} className={formField} />
          </Field>
          <Field label="Name" span={2}>
            <input name="name" required minLength={2} maxLength={120} className={formField} />
          </Field>

          <Field label="Designation">
            <input name="designation" maxLength={80} className={formField} />
          </Field>
          <Field label="Mobile">
            <input name="mobile" required minLength={6} maxLength={20} className={formField} />
          </Field>
          <Field label="Landline">
            <input name="landline" maxLength={40} className={formField} />
          </Field>
          <Field label="Extension">
            <input name="extension" maxLength={10} className={formField} />
          </Field>

          <Field label="Email" span={2}>
            <input name="email" maxLength={320} className={formField} />
          </Field>
          <Field label="Address 1" span={2}>
            <input name="addressLine1" maxLength={200} className={formField} />
          </Field>

          <Field label="Address 2" span={2}>
            <input name="addressLine2" maxLength={200} className={formField} />
          </Field>
          <Field label="Address 3" span={2}>
            <input name="addressLine3" maxLength={200} className={formField} />
          </Field>

          <Field label="Pin code">
            <input name="pinCode" required minLength={3} maxLength={12} className={formField} />
          </Field>
          <Field label="City">
            <input name="city" maxLength={80} className={formField} />
          </Field>
          <Field label="State">
            <select name="stateCode" className={formField}>
              <option value="">—</option>
              {states.map((row) => (
                <option key={row.code} value={row.code}>
                  {row.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="GST no.">
            <input name="gstin" maxLength={20} className={`${formField} font-mono uppercase`} />
          </Field>

          <Field label="PAN no.">
            <input name="pan" maxLength={20} className={`${formField} font-mono uppercase`} />
          </Field>
          <Field label="Aadhaar no.">
            <input name="aadhaar" maxLength={20} className={`${formField} font-mono`} />
          </Field>
          <Field label="Passport no.">
            <input name="passportNo" maxLength={20} className={formField} />
          </Field>
          <Field label="IEC no.">
            <input name="iecNo" maxLength={30} className={formField} />
          </Field>

          <Field label="AD code">
            <input name="adCode" maxLength={30} className={formField} />
          </Field>
          <Field label="LUT no.">
            <input name="lutNo" maxLength={40} className={formField} />
          </Field>
          <Field label="Remark" span={2}>
            <input name="remark" maxLength={500} className={formField} />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Toggle name="defaultShipper" label="Default shipper" />
          <button
            type="submit"
            disabled={pending}
            className="btn-primary rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save contact"}
          </button>
        </div>
      </FormPanel>
    </form>
  );
}
