"use client";

import { useActionState, useState } from "react";

import { FilterBar, useFilterBar, type FilterDefinition } from "@/components/filter-bar";
import { Field, Form, FormError, formField } from "@/components/form-field";
import { FormPanel } from "@/components/form-page";
import { DataToolbar } from "@/components/data-toolbar";
import { ActiveBadge, MasterTable } from "@/components/master-table";
import { Toggle } from "@/components/toggle";
import type { ActionResult, LookupRow } from "@/lib/api";
import { deleteLookup, saveLookup } from "./actions";

const DEFINITIONS: ReadonlyArray<FilterDefinition<LookupRow>> = [
  {
    kind: "text",
    key: "search",
    label: "Search",
    placeholder: "Code, name or description…",
    span: 3,
    match: (row) => `${row.code} ${row.name} ${row.description ?? ""}`,
  },
  {
    kind: "select",
    key: "status",
    label: "Status",
    options: [
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
    ],
    match: (row, value) => row.isActive === (value === "active"),
  },
];

/**
 * A short list, edited in place.
 *
 * These have three fields, so a separate route for the form would be a page
 * load to fill in a code and a name. The panel opens above the table and the
 * table stays visible, which is what makes "is that code already taken"
 * answerable without leaving.
 */
export function LookupManager({
  kind,
  label,
  rows,
  canManage,
}: {
  kind: string;
  label: { one: string; many: string };
  rows: LookupRow[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<LookupRow | "new" | null>(null);
  const [removeState, removeAction] = useActionState(deleteLookup, null);
  const { values, setValues, filtered, active, reset } = useFilterBar(rows, DEFINITIONS);

  return (
    <>
      <FormError message={removeState?.ok === false ? removeState.error : undefined} />

      <FilterBar
        definitions={DEFINITIONS}
        values={values}
        onChange={setValues}
        active={active}
        onReset={reset}
        total={rows.length}
        shown={filtered.length}
        noun={label}
        actions={
          <>
            <DataToolbar master={kind} label={label.many} canImport={canManage} />
            {canManage ? (
              <button
                type="button"
                onClick={() => setEditing((current) => (current ? null : "new"))}
                className="btn-primary rounded-lg px-3 py-2 text-sm font-medium"
              >
                {editing ? "Cancel" : `New ${label.one}`}
              </button>
            ) : null}
          </>
        }
      />

      {editing ? (
        // Keyed on the row, because defaultValue is read once at mount:
        // without it, editing a second row would show the first one's values
        // in a form that saves to the second.
        <div className="mb-4" key={editing === "new" ? "new" : editing.id}>
          <RowForm
            kind={kind}
            label={label}
            row={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
          />
        </div>
      ) : null}

      <MasterTable
        rows={filtered}
        rowKey={(row) => row.id}
        empty={`No ${label.many.toLowerCase()} yet.`}
        columns={[
          {
            header: "Code",
            cell: (row) => <span className="font-mono text-xs font-medium text-fg">{row.code}</span>,
          },
          {
            header: "Name",
            cell: (row) => (
              <>
                <span className="text-fg">{row.name}</span>
                {row.description ? (
                  <span className="block text-xs text-muted">{row.description}</span>
                ) : null}
              </>
            ),
          },
          {
            header: "Order",
            cell: (row) => <span className="text-xs tabular-nums text-muted">{row.sequence}</span>,
          },
          { header: "Status", cell: (row) => <ActiveBadge active={row.isActive} /> },
          {
            header: "Action",
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
                    <input type="hidden" name="kind" value={kind} />
                    <input type="hidden" name="id" value={row.id} />
                    <button
                      type="submit"
                      aria-label={`Delete ${row.code}`}
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
    </>
  );
}

function RowForm({
  kind,
  label,
  row,
  onDone,
}: {
  kind: string;
  label: { one: string; many: string };
  row: LookupRow | null;
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState(
    async (previous: ActionResult | null, form: FormData) => {
      const result = await saveLookup(previous, form);
      if (result.ok) onDone();
      return result;
    },
    null,
  );

  return (
    <Form action={submit} errors={state?.fieldErrors}>
      <input type="hidden" name="kind" value={kind} />
      {row ? <input type="hidden" name="id" value={row.id} /> : null}
      <FormError result={state} />

      <FormPanel title={row ? `Edit ${label.one}` : `New ${label.one}`}>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Code">
            <input
              name="code"
              required
              maxLength={20}
              pattern="[A-Za-z0-9\-]+"
              defaultValue={row?.code ?? ""}
              className={`${formField} font-mono uppercase`}
            />
          </Field>
          <Field label="Name">
            <input
              name="name"
              required
              maxLength={120}
              defaultValue={row?.name ?? ""}
              className={formField}
            />
          </Field>
          <Field label="Description" span={2}>
            <input
              name="description"
              maxLength={300}
              defaultValue={row?.description ?? ""}
              className={formField}
            />
          </Field>

          <Field label="Order" hint="Where it sits in a dropdown.">
            <input
              type="number"
              name="sequence"
              min={0}
              max={9999}
              defaultValue={row?.sequence ?? 0}
              className={`${formField} tabular-nums`}
            />
          </Field>

          <div className="flex items-end">
            <Toggle name="isActive" label="Active" defaultChecked={row?.isActive ?? true} />
          </div>

          <div className="flex items-end sm:col-start-4">
            <button
              type="submit"
              disabled={pending}
              className="btn-primary w-full rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </FormPanel>
    </Form>
  );
}
