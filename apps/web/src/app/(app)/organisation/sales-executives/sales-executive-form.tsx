"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, Form, FormError, formField } from "@/components/form-field";
import { FormActions, FormPanel } from "@/components/form-page";
import { Toggle } from "@/components/toggle";
import type { SalesExecutive } from "@/lib/api";
import { saveSalesExecutive } from "./actions";

export function SalesExecutiveForm({ executive }: { executive: SalesExecutive | null }) {
  const [state, action, pending] = useActionState(saveSalesExecutive, null);

  return (
    <Form errors={state?.fieldErrors} action={action} className="space-y-5">
      {executive ? <input type="hidden" name="id" value={executive.id} /> : null}
      <FormError result={state} />

      <FormPanel title="Sales">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Code">
            <input
              name="code"
              required
              minLength={2}
              maxLength={20}
              pattern="[A-Za-z0-9\\-]+"
              defaultValue={executive?.code}
              placeholder="ANU"
              className={`${formField} font-mono uppercase`}
            />
          </Field>
          <Field label="Name" span={2}>
            <input
              name="name"
              required
              minLength={2}
              maxLength={120}
              defaultValue={executive?.name}
              placeholder="ANUJ SINGH"
              className={formField}
            />
          </Field>
          <Field label="Commission %" hint="Up to four decimal places.">
            {/* type=text with a numeric pattern rather than type=number: a
                number input rounds through a float on some browsers, and this
                value multiplies invoice amounts. */}
            <input
              name="commissionPercent"
              inputMode="decimal"
              pattern="\\d{1,3}(\\.\\d{1,4})?"
              defaultValue={executive?.commissionPercent ?? "0"}
              className={`${formField} tabular-nums`}
            />
          </Field>

          <Field label="Email" span={2}>
            <input
              name="email"
              type="email"
              maxLength={320}
              defaultValue={executive?.email ?? ""}
              className={formField}
            />
          </Field>
          <Field label="Mobile" span={2}>
            <input
              name="mobile"
              maxLength={32}
              defaultValue={executive?.mobile ?? ""}
              className={formField}
            />
          </Field>
        </div>

        <div className="mt-4">
          <Toggle name="isActive" label="Active" defaultChecked={executive?.isActive ?? true} />
        </div>
      </FormPanel>

      <FormActions>
        <button
          type="submit"
          disabled={pending}
          className="btn-primary rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-60"
        >
          {pending ? "Saving…" : executive ? "Save changes" : "Create sales executive"}
        </button>
        <Link
          href="/organisation/sales-executives"
          className="btn-secondary rounded-lg px-5 py-2 text-sm font-medium"
        >
          Cancel
        </Link>
      </FormActions>
    </Form>
  );
}
