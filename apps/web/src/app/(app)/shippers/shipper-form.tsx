"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, FormError, formField } from "@/components/form-field";
import { FormActions, FormPanel } from "@/components/form-page";
import { Toggle } from "@/components/toggle";
import type { Destination, ServiceCentre, Shipper, StateRow } from "@/lib/api";
import { saveShipper } from "./actions";

export function ShipperForm({
  shipper,
  origins,
  centres,
  states,
  canManage,
}: {
  shipper: Shipper | null;
  origins: Destination[];
  centres: ServiceCentre[];
  states: StateRow[];
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState(saveShipper, null);

  return (
    <form action={action} className="space-y-5">
      {shipper ? <input type="hidden" name="id" value={shipper.id} /> : null}
      <FormError message={state?.error} />

      <FormPanel title="Shipper">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Origin">
            <select name="originId" defaultValue={shipper?.origin?.id ?? ""} className={formField}>
              <option value="">—</option>
              {origins.map((row) => (
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
              defaultValue={shipper?.code ?? ""}
              placeholder="29680"
              className={`${formField} font-mono uppercase`}
            />
          </Field>
          <Field label="Name">
            <input
              name="name"
              required
              maxLength={160}
              defaultValue={shipper?.name ?? ""}
              className={formField}
            />
          </Field>
          <Field label="Contact person">
            <input
              name="contactPerson"
              maxLength={120}
              defaultValue={shipper?.contactPerson ?? ""}
              className={formField}
            />
          </Field>

          <Field label="Address 1" span={2}>
            <input
              name="addressLine1"
              maxLength={200}
              defaultValue={shipper?.addressLine1 ?? ""}
              className={formField}
            />
          </Field>
          <Field label="Address 2" span={2}>
            <input
              name="addressLine2"
              maxLength={200}
              defaultValue={shipper?.addressLine2 ?? ""}
              className={formField}
            />
          </Field>

          <Field label="Pin code">
            <input name="pinCode" maxLength={12} defaultValue={shipper?.pinCode ?? ""} className={formField} />
          </Field>
          <Field label="City">
            <input name="city" maxLength={80} defaultValue={shipper?.city ?? ""} className={formField} />
          </Field>
          <Field label="State">
            <select name="stateCode" defaultValue={shipper?.stateCode ?? ""} className={formField}>
              <option value="">—</option>
              {states.map((row) => (
                <option key={row.code} value={row.code}>
                  {row.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Industry" hint="Free text until the industry master exists.">
            <input name="industry" maxLength={120} defaultValue={shipper?.industry ?? ""} className={formField} />
          </Field>

          <Field label="Tel. 1">
            <input name="telephone1" maxLength={40} defaultValue={shipper?.telephone1 ?? ""} className={formField} />
          </Field>
          <Field label="Tel. 2">
            <input name="telephone2" maxLength={40} defaultValue={shipper?.telephone2 ?? ""} className={formField} />
          </Field>
          <Field label="Mobile">
            <input name="mobile" maxLength={20} defaultValue={shipper?.mobile ?? ""} className={formField} />
          </Field>
          <Field label="Fax">
            <input name="fax" maxLength={40} defaultValue={shipper?.fax ?? ""} className={formField} />
          </Field>

          <Field label="Email" span={2}>
            <input name="email" maxLength={320} defaultValue={shipper?.email ?? ""} className={formField} />
          </Field>
          <Field label="Service centre" span={2}>
            <select
              name="serviceCentreId"
              defaultValue={shipper?.serviceCentre?.id ?? ""}
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

          <Field label="GST no.">
            <input name="gstin" maxLength={20} defaultValue={shipper?.gstin ?? ""} className={`${formField} font-mono uppercase`} />
          </Field>
          <Field label="Aadhaar no.">
            <input name="aadhaar" maxLength={20} defaultValue={shipper?.aadhaar ?? ""} className={`${formField} font-mono`} />
          </Field>
          <Field label="PAN no.">
            <input name="pan" maxLength={20} defaultValue={shipper?.pan ?? ""} className={`${formField} font-mono uppercase`} />
          </Field>
          <Field label="IEC no." hint="Required on every export shipping bill.">
            <input name="iecNo" maxLength={30} defaultValue={shipper?.iecNo ?? ""} className={`${formField} font-mono uppercase`} />
          </Field>
        </div>
      </FormPanel>

      <FormPanel
        title="Export paperwork"
        description="A shipper is the exporter of record. None of this applies to a consignee, which is why it is not on that form."
      >
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Bank AD code" hint="The authorised dealer the proceeds are realised through.">
            <input name="bankAdCode" maxLength={30} defaultValue={shipper?.bankAdCode ?? ""} className={formField} />
          </Field>
          <Field label="Bank account">
            <input name="bankAccount" maxLength={40} defaultValue={shipper?.bankAccount ?? ""} className={`${formField} font-mono`} />
          </Field>
          <Field label="Bank IFSC">
            <input name="bankIfsc" maxLength={20} defaultValue={shipper?.bankIfsc ?? ""} className={`${formField} font-mono uppercase`} />
          </Field>
          <Field label="Firm">
            <select name="firm" defaultValue={shipper?.firm ?? ""} className={formField}>
              <option value="">—</option>
              <option value="GOVT">Govt</option>
              <option value="NON_GOVT">Non-govt</option>
            </select>
          </Field>

          <Field label="LUT number" hint="Exports without paying IGST up front.">
            <input name="lutNumber" maxLength={40} defaultValue={shipper?.lutNumber ?? ""} className={formField} />
          </Field>
          <Field label="LUT issue date">
            <input type="date" name="lutIssueDate" defaultValue={shipper?.lutIssueDate ?? ""} className={formField} />
          </Field>
          <Field label="LUT till date">
            <input type="date" name="lutTillDate" defaultValue={shipper?.lutTillDate ?? ""} className={formField} />
          </Field>
        </div>

        <div className="mt-4">
          <Toggle
            name="nfei"
            label="NFEI — no foreign exchange involved"
            defaultChecked={shipper?.nfei ?? false}
          />
        </div>

        <div className="mt-4">
          <Toggle name="isActive" label="Active" defaultChecked={shipper?.isActive ?? true} />
        </div>
      </FormPanel>

      <FormActions>
        <button
          type="submit"
          disabled={pending || !canManage}
          className="btn-primary rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-60"
        >
          {pending ? "Saving…" : shipper ? "Save changes" : "Create shipper"}
        </button>
        <Link href="/shippers" className="btn-secondary rounded-lg px-5 py-2 text-sm font-medium">
          Cancel
        </Link>
      </FormActions>
    </form>
  );
}
