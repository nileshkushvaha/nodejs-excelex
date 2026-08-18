"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, Form, FormError, formField } from "@/components/form-field";
import { FormActions, FormPanel } from "@/components/form-page";
import { Toggle } from "@/components/toggle";
import type { Zone } from "@/lib/api";
import { saveZone } from "./actions";

export function ZoneForm({ zone }: { zone: Zone | null }) {
  const [state, action, pending] = useActionState(saveZone, null);

  return (
    <Form errors={state?.fieldErrors} action={action} className="space-y-5">
      {zone ? <input type="hidden" name="id" value={zone.id} /> : null}
      <FormError result={state} />

      <FormPanel title="Zone">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Zone code">
            <input
              name="code"
              required
              maxLength={20}
              pattern="[A-Za-z0-9\\-]+"
              defaultValue={zone?.code}
              placeholder="Z1"
              className={`${formField} font-mono uppercase`}
            />
          </Field>
          <Field label="Zone name" span={3}>
            <input
              name="name"
              required
              minLength={2}
              maxLength={80}
              defaultValue={zone?.name}
              placeholder="Within city"
              className={formField}
            />
          </Field>
        </div>

        <div className="mt-4">
          <Toggle name="isActive" label="Active" defaultChecked={zone?.isActive ?? true} />
        </div>
      </FormPanel>

      <FormActions>
        <button
          type="submit"
          disabled={pending}
          className="btn-primary rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-60"
        >
          {pending ? "Saving…" : zone ? "Save changes" : "Create zone"}
        </button>
        <Link href="/geography/zones" className="btn-secondary rounded-lg px-5 py-2 text-sm font-medium">
          Cancel
        </Link>
      </FormActions>
    </Form>
  );
}
