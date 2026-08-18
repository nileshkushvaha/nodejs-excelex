"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, Form, FormError, formField } from "@/components/form-field";
import { FormActions, FormPanel } from "@/components/form-page";
import { SearchableField } from "@/components/searchable-select";
import { Toggle } from "@/components/toggle";
import type { AccountGroup } from "@/lib/api";
import { saveAccountGroup } from "./actions";

export function GroupForm({
  group,
  groups,
  canManage,
}: {
  group: AccountGroup | null;
  groups: AccountGroup[];
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState(saveAccountGroup, null);

  // A group cannot be offered itself as its parent. Its descendants are
  // rejected by the server rather than hidden here: working out the subtree
  // in the browser would duplicate the rule, and two copies of a rule are
  // two chances to disagree.
  const options = groups
    .filter((row) => row.id !== group?.id)
    .map((row) => ({ value: row.id, label: `${row.code} — ${row.name}` }));

  return (
    <Form errors={state?.fieldErrors} action={action} className="space-y-5">
      {group ? <input type="hidden" name="id" value={group.id} /> : null}
      <FormError result={state} />

      <FormPanel title="Group">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Group code">
            <input
              name="code"
              required
              maxLength={20}
              pattern="[A-Za-z0-9\-]+"
              defaultValue={group?.code ?? ""}
              placeholder="A3300"
              className={`${formField} font-mono uppercase`}
            />
          </Field>
          <Field label="Group name">
            <input
              name="name"
              required
              minLength={2}
              maxLength={120}
              defaultValue={group?.name ?? ""}
              placeholder="Sundry Debtors"
              className={formField}
            />
          </Field>
          <Field label="Under group" hint="Leave empty for a top-level group.">
            <SearchableField
              name="parentId"
              options={options}
              defaultValue={group?.parent?.id ?? ""}
              allLabel="Top level"
            />
          </Field>
        </div>

        <div className="mt-4">
          <Toggle name="isActive" label="Active" defaultChecked={group?.isActive ?? true} />
        </div>
      </FormPanel>

      <FormActions>
        <button
          type="submit"
          disabled={pending || !canManage}
          className="btn-primary rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-60"
        >
          {pending ? "Saving…" : group ? "Save changes" : "Create group"}
        </button>
        <Link href="/accounts/groups" className="btn-secondary rounded-lg px-5 py-2 text-sm font-medium">
          Cancel
        </Link>
      </FormActions>
    </Form>
  );
}
