"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, FormError, formField } from "@/components/form-field";
import { FormActions, FormPanel } from "@/components/form-page";
import { Toggle } from "@/components/toggle";
import type { Consignee, Destination, ServiceCentre, StateRow } from "@/lib/api";
import { saveConsignee } from "./actions";

export function ConsigneeForm({
  consignee,
  destinations,
  centres,
  states,
  canManage,
}: {
  consignee: Consignee | null;
  destinations: Destination[];
  centres: ServiceCentre[];
  states: StateRow[];
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState(saveConsignee, null);

  return (
    <form action={action} className="space-y-5">
      {consignee ? <input type="hidden" name="id" value={consignee.id} /> : null}
      <FormError message={state?.error} />

      <FormPanel title="Consignee">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Destination">
            <select name="destinationId" defaultValue={consignee?.destination?.id ?? ""} className={formField}>
              <option value="">—</option>
              {destinations.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} — {row.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Code">
            <input
              name="code"
              required
              maxLength={20}
              pattern="[A-Za-z0-9\-]+"
              defaultValue={consignee?.code ?? ""}
              placeholder="29680"
              className={`${formField} font-mono uppercase`}
            />
          </Field>
          <Field label="Name">
            <input
              name="name"
              required
              maxLength={160}
              defaultValue={consignee?.name ?? ""}
              className={formField}
            />
          </Field>
          <Field label="Contact person">
            <input
              name="contactPerson"
              maxLength={120}
              defaultValue={consignee?.contactPerson ?? ""}
              className={formField}
            />
          </Field>

          <Field label="Address 1" span={2}>
            <input
              name="addressLine1"
              maxLength={200}
              defaultValue={consignee?.addressLine1 ?? ""}
              className={formField}
            />
          </Field>
          <Field label="Address 2" span={2}>
            <input
              name="addressLine2"
              maxLength={200}
              defaultValue={consignee?.addressLine2 ?? ""}
              className={formField}
            />
          </Field>

          <Field label="Pin code">
            <input name="pinCode" maxLength={12} defaultValue={consignee?.pinCode ?? ""} className={formField} />
          </Field>
          <Field label="City">
            <input name="city" maxLength={80} defaultValue={consignee?.city ?? ""} className={formField} />
          </Field>
          <Field label="State">
            <select name="stateCode" defaultValue={consignee?.stateCode ?? ""} className={formField}>
              <option value="">—</option>
              {states.map((row) => (
                <option key={row.code} value={row.code}>
                  {row.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Industry" hint="Free text until the industry master exists.">
            <input name="industry" maxLength={120} defaultValue={consignee?.industry ?? ""} className={formField} />
          </Field>

          <Field label="Tel. 1">
            <input name="telephone1" maxLength={40} defaultValue={consignee?.telephone1 ?? ""} className={formField} />
          </Field>
          <Field label="Tel. 2">
            <input name="telephone2" maxLength={40} defaultValue={consignee?.telephone2 ?? ""} className={formField} />
          </Field>
          <Field label="Mobile">
            <input name="mobile" maxLength={20} defaultValue={consignee?.mobile ?? ""} className={formField} />
          </Field>
          <Field label="Fax">
            <input name="fax" maxLength={40} defaultValue={consignee?.fax ?? ""} className={formField} />
          </Field>

          <Field label="Email" span={2}>
            <input name="email" maxLength={320} defaultValue={consignee?.email ?? ""} className={formField} />
          </Field>
          <Field label="Service centre" span={2}>
            <select
              name="serviceCentreId"
              defaultValue={consignee?.serviceCentre?.id ?? ""}
              className={formField}
            >
              <option value="">—</option>
              {centres.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="EORI" hint="EU customs identifier for the receiving party.">
            <input name="eori" maxLength={30} defaultValue={consignee?.eori ?? ""} className={`${formField} font-mono uppercase`} />
          </Field>
          <Field label="VAT">
            <input name="vat" maxLength={30} defaultValue={consignee?.vat ?? ""} className={`${formField} font-mono uppercase`} />
          </Field>
        </div>

        <div className="mt-4">
          <Toggle name="isActive" label="Active" defaultChecked={consignee?.isActive ?? true} />
        </div>
      </FormPanel>

      <FormActions>
        <button
          type="submit"
          disabled={pending || !canManage}
          className="btn-primary rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-60"
        >
          {pending ? "Saving…" : consignee ? "Save changes" : "Create consignee"}
        </button>
        <Link href="/consignees" className="btn-secondary rounded-lg px-5 py-2 text-sm font-medium">
          Cancel
        </Link>
      </FormActions>
    </form>
  );
}
