"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, FormError, formField } from "@/components/form-field";
import { FormActions, FormPanel } from "@/components/form-page";
import { Toggle } from "@/components/toggle";
import type { Department } from "@/lib/api";
import { saveDepartment } from "../actions";

export function DepartmentForm({ department }: { department: Department | null }) {
  const [state, action, pending] = useActionState(saveDepartment, null);

  return (
    <form action={action} className="space-y-5">
      {department ? <input type="hidden" name="id" value={department.id} /> : null}
      <FormError message={state?.error} />

      <FormPanel title="Department">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Code">
            <input
              name="code"
              required
              minLength={2}
              maxLength={20}
              pattern="[A-Za-z0-9\\-]+"
              defaultValue={department?.code}
              placeholder="OPS"
              className={`${formField} font-mono uppercase`}
            />
          </Field>
          <Field label="Name" span={3}>
            <input
              name="name"
              required
              minLength={2}
              maxLength={80}
              defaultValue={department?.name}
              placeholder="Operations"
              className={formField}
            />
          </Field>
          <Field label="Description" span={4}>
            <input
              name="description"
              maxLength={300}
              defaultValue={department?.description ?? ""}
              className={formField}
            />
          </Field>
        </div>

        <div className="mt-4">
          <Toggle
            name="isActive"
            label="Active"
            description="Inactive departments stay on record but are not offered when assigning staff."
            defaultChecked={department?.isActive ?? true}
          />
        </div>
      </FormPanel>

      <FormActions>
        <button
          type="submit"
          disabled={pending}
          className="btn-primary rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-60"
        >
          {pending ? "Saving…" : department ? "Save changes" : "Create department"}
        </button>
        <Link href="/organisation/departments" className="btn-secondary rounded-lg px-5 py-2 text-sm font-medium">
          Cancel
        </Link>
      </FormActions>
    </form>
  );
}
