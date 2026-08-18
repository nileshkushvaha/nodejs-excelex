"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, Form, FormError, formField } from "@/components/form-field";
import { FormActions, FormPanel } from "@/components/form-page";
import { Toggle } from "@/components/toggle";
import type { Destination, ServiceCentre, StateRow } from "@/lib/api";
import { saveServiceCentre } from "./actions";

export function ServiceCentreForm({
  centre,
  destinations,
  states,
}: {
  centre: ServiceCentre | null;
  destinations: Destination[];
  states: StateRow[];
}) {
  const [state, action, pending] = useActionState(saveServiceCentre, null);

  return (
    <Form errors={state?.fieldErrors} action={action} className="space-y-5">
          {centre ? <input type="hidden" name="id" value={centre.id} /> : null}
          <FormError result={state} />
  
          <FormPanel title="Service centre details">
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Code">
                <input
                  name="code"
                  required
                  minLength={2}
                  maxLength={20}
                  pattern="[A-Za-z0-9\-]+"
                  defaultValue={centre?.code}
                  className={`${formField} font-mono uppercase`}
                />
              </Field>
              <Field label="Name" span={2}>
                <input name="name" required maxLength={160} defaultValue={centre?.name} className={formField} />
              </Field>
              <Field label="Sub name">
                <input name="subName" maxLength={160} defaultValue={centre?.subName ?? ""} className={formField} />
              </Field>
  
              <Field label="Address 1" span={2}>
                <input name="addressLine1" maxLength={200} defaultValue={centre?.addressLine1 ?? ""} className={formField} />
              </Field>
              <Field label="Address 2" span={2}>
                <input name="addressLine2" maxLength={200} defaultValue={centre?.addressLine2 ?? ""} className={formField} />
              </Field>
              <Field label="Address 3" span={2}>
                <input name="addressLine3" maxLength={200} defaultValue={centre?.addressLine3 ?? ""} className={formField} />
              </Field>
              <Field label="Address 4" span={2}>
                <input name="addressLine4" maxLength={200} defaultValue={centre?.addressLine4 ?? ""} className={formField} />
              </Field>
  
              <Field label="Branch (destination)" span={2}>
                <select name="destinationId" defaultValue={centre?.destination?.id ?? ""} className={formField}>
                  <option value="">None</option>
                  {destinations.map((destination) => (
                    <option key={destination.id} value={destination.id}>
                      {destination.code} — {destination.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="State">
                <select name="stateCode" defaultValue={centre?.stateCode ?? ""} className={formField}>
                  <option value="">Select state</option>
                  {states.map((row) => (
                    <option key={row.code} value={row.code}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Pin code">
                <input name="pinCode" maxLength={16} defaultValue={centre?.pinCode ?? ""} className={formField} />
              </Field>
  
              <Field label="Telephone">
                <input name="telephone" maxLength={32} defaultValue={centre?.telephone ?? ""} className={formField} />
              </Field>
              <Field label="Email address" span={2}>
                <input name="email" type="email" maxLength={320} defaultValue={centre?.email ?? ""} className={formField} />
              </Field>
              <Field label="Country">
                <input name="countryCode" maxLength={2} defaultValue={centre?.countryCode ?? "IN"} className={`${formField} uppercase`} />
              </Field>
  
              <Field label="GST No.">
                <input name="gstin" maxLength={15} defaultValue={centre?.gstin ?? ""} className={`${formField} font-mono uppercase`} />
              </Field>
              <Field label="GST telephone">
                <input name="gstTelephone" maxLength={32} defaultValue={centre?.gstTelephone ?? ""} className={formField} />
              </Field>
              <Field label="PAN No.">
                <input name="pan" maxLength={10} defaultValue={centre?.pan ?? ""} className={`${formField} font-mono uppercase`} />
              </Field>
              <Field label="ICN No.">
                <input name="icnNo" maxLength={40} defaultValue={centre?.icnNo ?? ""} className={formField} />
              </Field>
              <Field label="ST No.">
                <input name="stNo" maxLength={40} defaultValue={centre?.stNo ?? ""} className={formField} />
              </Field>
            </div>
  
            <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
              <strong>Company and signatory logos are not available yet.</strong> They need the
              object-storage service, which is in the stack but not wired. A file picker that
              silently discarded your artwork would be worse than this message.
            </p>
          </FormPanel>
  
          <FormPanel title="Terms">
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 10 }, (_, index) => (
                <Field key={index} label={`Terms ${index + 1}`}>
                  <input
                    name={`terms.${index}`}
                    maxLength={300}
                    defaultValue={centre?.terms[index] ?? ""}
                    className={formField}
                  />
                </Field>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              Ten lines, printed on the invoice in this order. Bank details have their own fields
              below — the old system kept them here, which is why they print in the wrong place.
            </p>
          </FormPanel>
  
          <FormPanel title="Bank details">
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Bank name" span={2}>
                <input name="bankName" maxLength={120} defaultValue={centre?.bankName ?? ""} className={formField} />
              </Field>
              <Field label="Account no.">
                <input name="bankAccountNo" maxLength={40} defaultValue={centre?.bankAccountNo ?? ""} className={`${formField} font-mono`} />
              </Field>
              <Field label="Account name">
                <input name="bankAccountName" maxLength={120} defaultValue={centre?.bankAccountName ?? ""} className={formField} />
              </Field>
              <Field label="Bank address" span={2}>
                <input name="bankAddress" maxLength={200} defaultValue={centre?.bankAddress ?? ""} className={formField} />
              </Field>
              <Field label="RTGS / NEFT IFSC">
                <input name="ifsc" maxLength={11} defaultValue={centre?.ifsc ?? ""} className={`${formField} font-mono uppercase`} />
              </Field>
              <Field label="MICR">
                <input name="micr" maxLength={9} defaultValue={centre?.micr ?? ""} className={`${formField} font-mono`} />
              </Field>
            </div>
          </FormPanel>
  
          <FormPanel title="Document numbering">
            <div className="space-y-3">
              {[
                { label: "Invoice", prefix: "invoicePrefix", last: "invoiceLastNo", suffix: "invoiceSuffix" },
                { label: "Free-form invoice", prefix: "freeFormPrefix", last: "freeFormLastNo", suffix: "freeFormSuffix" },
                { label: "Debit note", prefix: "debitNotePrefix", last: "debitNoteLastNo", suffix: "debitNoteSuffix" },
                { label: "Credit note", prefix: "creditNotePrefix", last: "creditNoteLastNo", suffix: "creditNoteSuffix" },
              ].map((row) => (
                <div key={row.label} className="grid items-end gap-3 sm:grid-cols-4">
                  <span className="text-sm font-medium text-fg">{row.label}</span>
                  <Field label="Prefix">
                    <input
                      name={row.prefix}
                      maxLength={20}
                      defaultValue={(centre?.[row.prefix as keyof ServiceCentre] as string | null) ?? ""}
                      className={formField}
                    />
                  </Field>
                  <Field label="Last number issued">
                    <input
                      name={row.last}
                      type="number"
                      min={0}
                      defaultValue={(centre?.[row.last as keyof ServiceCentre] as number) ?? 0}
                      className={`${formField} tabular-nums`}
                    />
                  </Field>
                  <Field label="Suffix">
                    <input
                      name={row.suffix}
                      maxLength={20}
                      defaultValue={(centre?.[row.suffix as keyof ServiceCentre] as string | null) ?? ""}
                      className={formField}
                    />
                  </Field>
                </div>
              ))}
  
              <div className="grid items-end gap-3 sm:grid-cols-4">
                <span className="text-sm font-medium text-fg">Receipt</span>
                <Field label="Last number issued">
                  <input
                    name="receiptLastNo"
                    type="number"
                    min={0}
                    defaultValue={centre?.receiptLastNo ?? 0}
                    className={`${formField} tabular-nums`}
                  />
                </Field>
              </div>
            </div>
  
            <p className="mt-3 rounded border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
              These record the last number <em>issued</em>, so the next document takes the one after.
              A counter can be corrected upward but never downward — lowering it would reissue numbers
              already on documents, which is a statutory problem rather than an untidy one.
            </p>
          </FormPanel>
  
          <Toggle name="isActive" label="Active" defaultChecked={centre?.isActive ?? true} />
          <FormActions>
            <button
              type="submit"
              disabled={pending}
              className="btn-primary rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-60"
            >
              {pending ? "Saving…" : centre ? "Save changes" : "Create service centre"}
            </button>
            <Link href="/network/service-centres" className="btn-secondary rounded-lg px-5 py-2 text-sm font-medium">
              Cancel
            </Link>
          </FormActions>
        </Form>
  );
}
