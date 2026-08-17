"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, FormError, formField } from "@/components/form-field";
import { FormActions, FormPanel } from "@/components/form-page";
import { Toggle } from "@/components/toggle";
import type { Classification } from "@/lib/api";
import { saveProductType } from "./actions";

export function ProductTypeForm({ type }: { type: Classification | null }) {
  const [state, action, pending] = useActionState(saveProductType, null);

  return (
    <form action={action} className="space-y-5">
      {type ? <input type="hidden" name="id" value={type.id} /> : null}
      <FormError message={state?.error} />

      <FormPanel title="Product type">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Code">
            <input
              name="code"
              required
              maxLength={10}
              pattern="[A-Za-z0-9\-]+"
              defaultValue={type?.code}
              placeholder="D"
              className={`${formField} font-mono uppercase`}
            />
          </Field>
          <Field label="Name" span={3}>
            <input
              name="name"
              required
              minLength={2}
              maxLength={80}
              defaultValue={type?.name}
              placeholder="Domestic"
              className={formField}
            />
          </Field>
        </div>

        <div className="mt-4">
          <Toggle name="isActive" label="Active" defaultChecked={type?.isActive ?? true} />
        </div>
      </FormPanel>

      <FormActions>
        <button
          type="submit"
          disabled={pending}
          className="btn-primary rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-60"
        >
          {pending ? "Saving…" : type ? "Save changes" : "Create product type"}
        </button>
        <Link
          href="/products/types"
          className="btn-secondary rounded-lg px-5 py-2 text-sm font-medium"
        >
          Cancel
        </Link>
      </FormActions>
    </form>
  );
}
