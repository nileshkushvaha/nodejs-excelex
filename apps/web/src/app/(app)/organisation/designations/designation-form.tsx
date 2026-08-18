"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, Form, FormError, formField } from "@/components/form-field";
import { FormActions, FormPanel } from "@/components/form-page";
import { Toggle } from "@/components/toggle";
import type { Department, Designation } from "@/lib/api";
import { saveDesignation } from "../actions";

export function DesignationForm({
  designation,
  departments,
}: {
  designation: Designation | null;
  departments: Department[];
}) {
  const [state, action, pending] = useActionState(saveDesignation, null);

  return (
    <Form errors={state?.fieldErrors} action={action} className="space-y-5">
      {designation ? <input type="hidden" name="id" value={designation.id} /> : null}
      <FormError result={state} />

      <FormPanel title="Designation">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Code">
            <input
              name="code"
              required
              minLength={2}
              maxLength={20}
              pattern="[A-Za-z0-9\\-]+"
              defaultValue={designation?.code}
              placeholder="OPS-SUP"
              className={`${formField} font-mono uppercase`}
            />
          </Field>
          <Field label="Title" span={3}>
            <input
              name="name"
              required
              minLength={2}
              maxLength={80}
              defaultValue={designation?.name}
              placeholder="Operations Supervisor"
              className={formField}
            />
          </Field>

          <Field label="Department" span={3}>
            <select
              name="departmentId"
              defaultValue={designation?.department?.id ?? ""}
              className={formField}
            >
              <option value="">Company-wide</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Level"
            hint="Seniority, low to high. Leave gaps so a grade can be inserted later without renumbering."
          >
            <input
              name="level"
              type="number"
              min={0}
              max={1000}
              defaultValue={designation?.level ?? 0}
              className={`${formField} tabular-nums`}
            />
          </Field>

          <Field label="Description" span={4}>
            <input
              name="description"
              maxLength={300}
              defaultValue={designation?.description ?? ""}
              className={formField}
            />
          </Field>
        </div>

        <div className="mt-4">
          <Toggle name="isActive" label="Active" defaultChecked={designation?.isActive ?? true} />
        </div>
      </FormPanel>

      <FormActions>
        <button
          type="submit"
          disabled={pending}
          className="btn-primary rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-60"
        >
          {pending ? "Saving…" : designation ? "Save changes" : "Create designation"}
        </button>
        <Link href="/organisation/designations" className="btn-secondary rounded-lg px-5 py-2 text-sm font-medium">
          Cancel
        </Link>
      </FormActions>
    </Form>
  );
}
