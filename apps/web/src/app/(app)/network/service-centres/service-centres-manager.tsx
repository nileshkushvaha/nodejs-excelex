"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";

import { MasterDialog } from "@/components/master-dialog";
import { ActiveBadge, MasterTable } from "@/components/master-table";
import { Toggle } from "@/components/toggle";
import type { Destination, ServiceCentre, StateRow } from "@/lib/api";
import { deleteServiceCentre, saveServiceCentre } from "./actions";

const field =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft";

function Field({
  label,
  children,
  span,
}: {
  label: string;
  children: ReactNode;
  span?: 2 | 3 | 4;
}) {
  const width = span === 4 ? "sm:col-span-4" : span === 3 ? "sm:col-span-3" : span === 2 ? "sm:col-span-2" : "";
  return (
    <label className={`block ${width}`}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

/** A titled panel, matching the grouped layout of the form it replaces. */
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-line">
      <legend className="brand-gradient ml-3 rounded-full px-3 py-0.5 text-xs font-semibold text-white">
        {title}
      </legend>
      <div className="p-4 pt-3">{children}</div>
    </fieldset>
  );
}

export function ServiceCentresManager({
  centres,
  destinations,
  states,
  canManage,
}: {
  centres: ServiceCentre[];
  destinations: Destination[];
  states: StateRow[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<ServiceCentre | null>(null);
  const [creating, setCreating] = useState(false);
  const [removeState, removeAction] = useActionState(deleteServiceCentre, null);

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
        rows={centres}
        rowKey={(row) => row.id}
        searchable={(row) => `${row.code} ${row.name} ${row.destination?.code ?? ""} ${row.gstin ?? ""}`}
        placeholder="Search by code, name, branch or GSTIN…"
        empty="No service centres yet."
        actions={
          canManage ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="btn-primary rounded-lg px-3 py-2 text-sm font-medium"
            >
              New service centre
            </button>
          ) : null
        }
        columns={[
          {
            header: "Service Centre Code",
            cell: (row) => <span className="font-mono text-xs font-medium text-fg">{row.code}</span>,
          },
          {
            header: "Service Centre Name",
            cell: (row) => (
              <>
                <span className="text-fg">{row.name}</span>
                {row.subName ? (
                  <span className="block text-xs text-muted">{row.subName}</span>
                ) : null}
              </>
            ),
          },
          {
            header: "Branch",
            cell: (row) => (
              <span className="font-mono text-xs text-muted">{row.destination?.code ?? "—"}</span>
            ),
          },
          {
            header: "GSTIN",
            cell: (row) => <span className="font-mono text-xs text-muted">{row.gstin ?? "—"}</span>,
          },
          {
            header: "Next invoice",
            cell: (row) => (
              // The number the next invoice will carry, not the last one issued.
              // "27129" answers a different question from "what comes next".
              <span className="font-mono text-xs tabular-nums text-muted">
                {`${row.invoicePrefix ?? ""}${row.invoiceLastNo + 1}${row.invoiceSuffix ?? ""}`}
              </span>
            ),
          },
          { header: "Status", cell: (row) => <ActiveBadge active={row.isActive} /> },
          {
            header: "",
            className: "text-right",
            cell: (row) =>
              canManage ? (
                <span className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(row)}
                    className="rounded border border-line-strong px-2 py-1 text-xs text-fg transition-colors hover:border-accent hover:bg-surface-2"
                  >
                    Edit
                  </button>
                  <form action={removeAction}>
                    <input type="hidden" name="id" value={row.id} />
                    <button
                      type="submit"
                      className="rounded border border-line-strong px-2 py-1 text-xs text-red-700 transition-colors hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/50"
                    >
                      Delete
                    </button>
                  </form>
                </span>
              ) : null,
          },
        ]}
      />

      <ServiceCentreDialog
        key={editing?.id ?? "new"}
        open={creating || editing !== null}
        centre={editing}
        destinations={destinations}
        states={states}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </>
  );
}

function ServiceCentreDialog({
  open,
  centre,
  destinations,
  states,
  onClose,
}: {
  open: boolean;
  centre: ServiceCentre | null;
  destinations: Destination[];
  states: StateRow[];
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(saveServiceCentre, null);

  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <MasterDialog
      open={open}
      onClose={onClose}
      title={centre ? `Edit ${centre.code}` : "New service centre"}
      description="The registered entity that issues invoices. Its GST registration, bank account and numbering are its own."
      wide
    >
      <form action={action} className="space-y-5">
        {centre ? <input type="hidden" name="id" value={centre.id} /> : null}

        {state && !state.ok ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
          >
            {state.error}
          </p>
        ) : null}

        <Panel title="Service centre details">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Code">
              <input
                name="code"
                required
                minLength={2}
                maxLength={20}
                pattern="[A-Za-z0-9\-]+"
                defaultValue={centre?.code}
                className={`${field} font-mono uppercase`}
              />
            </Field>
            <Field label="Name" span={2}>
              <input name="name" required maxLength={160} defaultValue={centre?.name} className={field} />
            </Field>
            <Field label="Sub name">
              <input name="subName" maxLength={160} defaultValue={centre?.subName ?? ""} className={field} />
            </Field>

            <Field label="Address 1" span={2}>
              <input name="addressLine1" maxLength={200} defaultValue={centre?.addressLine1 ?? ""} className={field} />
            </Field>
            <Field label="Address 2" span={2}>
              <input name="addressLine2" maxLength={200} defaultValue={centre?.addressLine2 ?? ""} className={field} />
            </Field>
            <Field label="Address 3" span={2}>
              <input name="addressLine3" maxLength={200} defaultValue={centre?.addressLine3 ?? ""} className={field} />
            </Field>
            <Field label="Address 4" span={2}>
              <input name="addressLine4" maxLength={200} defaultValue={centre?.addressLine4 ?? ""} className={field} />
            </Field>

            <Field label="Branch (destination)" span={2}>
              <select name="destinationId" defaultValue={centre?.destination?.id ?? ""} className={field}>
                <option value="">None</option>
                {destinations.map((destination) => (
                  <option key={destination.id} value={destination.id}>
                    {destination.code} — {destination.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="State">
              <select name="stateCode" defaultValue={centre?.stateCode ?? ""} className={field}>
                <option value="">Select state</option>
                {states.map((row) => (
                  <option key={row.code} value={row.code}>
                    {row.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Pin code">
              <input name="pinCode" maxLength={16} defaultValue={centre?.pinCode ?? ""} className={field} />
            </Field>

            <Field label="Telephone">
              <input name="telephone" maxLength={32} defaultValue={centre?.telephone ?? ""} className={field} />
            </Field>
            <Field label="Email address" span={2}>
              <input name="email" type="email" maxLength={320} defaultValue={centre?.email ?? ""} className={field} />
            </Field>
            <Field label="Country">
              <input name="countryCode" maxLength={2} defaultValue={centre?.countryCode ?? "IN"} className={`${field} uppercase`} />
            </Field>

            <Field label="GST No.">
              <input name="gstin" maxLength={15} defaultValue={centre?.gstin ?? ""} className={`${field} font-mono uppercase`} />
            </Field>
            <Field label="GST telephone">
              <input name="gstTelephone" maxLength={32} defaultValue={centre?.gstTelephone ?? ""} className={field} />
            </Field>
            <Field label="PAN No.">
              <input name="pan" maxLength={10} defaultValue={centre?.pan ?? ""} className={`${field} font-mono uppercase`} />
            </Field>
            <Field label="ICN No.">
              <input name="icnNo" maxLength={40} defaultValue={centre?.icnNo ?? ""} className={field} />
            </Field>
            <Field label="ST No.">
              <input name="stNo" maxLength={40} defaultValue={centre?.stNo ?? ""} className={field} />
            </Field>
          </div>

          <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
            <strong>Company and signatory logos are not available yet.</strong> They need the
            object-storage service, which is in the stack but not wired. A file picker that
            silently discarded your artwork would be worse than this message.
          </p>
        </Panel>

        <Panel title="Terms">
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 10 }, (_, index) => (
              <Field key={index} label={`Terms ${index + 1}`}>
                <input
                  name={`terms.${index}`}
                  maxLength={300}
                  defaultValue={centre?.terms[index] ?? ""}
                  className={field}
                />
              </Field>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            Ten lines, printed on the invoice in this order. Bank details have their own fields
            below — the old system kept them here, which is why they print in the wrong place.
          </p>
        </Panel>

        <Panel title="Bank details">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Bank name" span={2}>
              <input name="bankName" maxLength={120} defaultValue={centre?.bankName ?? ""} className={field} />
            </Field>
            <Field label="Account no.">
              <input name="bankAccountNo" maxLength={40} defaultValue={centre?.bankAccountNo ?? ""} className={`${field} font-mono`} />
            </Field>
            <Field label="Account name">
              <input name="bankAccountName" maxLength={120} defaultValue={centre?.bankAccountName ?? ""} className={field} />
            </Field>
            <Field label="Bank address" span={2}>
              <input name="bankAddress" maxLength={200} defaultValue={centre?.bankAddress ?? ""} className={field} />
            </Field>
            <Field label="RTGS / NEFT IFSC">
              <input name="ifsc" maxLength={11} defaultValue={centre?.ifsc ?? ""} className={`${field} font-mono uppercase`} />
            </Field>
            <Field label="MICR">
              <input name="micr" maxLength={9} defaultValue={centre?.micr ?? ""} className={`${field} font-mono`} />
            </Field>
          </div>
        </Panel>

        <Panel title="Document numbering">
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
                    className={field}
                  />
                </Field>
                <Field label="Last number issued">
                  <input
                    name={row.last}
                    type="number"
                    min={0}
                    defaultValue={(centre?.[row.last as keyof ServiceCentre] as number) ?? 0}
                    className={`${field} tabular-nums`}
                  />
                </Field>
                <Field label="Suffix">
                  <input
                    name={row.suffix}
                    maxLength={20}
                    defaultValue={(centre?.[row.suffix as keyof ServiceCentre] as string | null) ?? ""}
                    className={field}
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
                  className={`${field} tabular-nums`}
                />
              </Field>
            </div>
          </div>

          <p className="mt-3 rounded border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
            These record the last number <em>issued</em>, so the next document takes the one after.
            A counter can be corrected upward but never downward — lowering it would reissue numbers
            already on documents, which is a statutory problem rather than an untidy one.
          </p>
        </Panel>

        <Toggle name="isActive" label="Active" defaultChecked={centre?.isActive ?? true} />

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {pending ? "Saving…" : centre ? "Save changes" : "Create service centre"}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary rounded-lg px-4 py-2 text-sm font-medium">
            Cancel
          </button>
        </div>
      </form>
    </MasterDialog>
  );
}
