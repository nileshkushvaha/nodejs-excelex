"use client";

import { useActionState, useState, type ReactNode } from "react";

import { FormError } from "@/components/form-field";
import { MasterTable } from "@/components/master-table";
import type { ActionResult } from "@/lib/api";
import { deleteDetail } from "./detail-actions";

/**
 * The shape all four child tabs share: a table, and a form that appears when
 * you ask for it.
 *
 * The legacy screens put the add form above the table and leave it there
 * permanently, which costs half a screen on a tab whose job is to show what
 * has already been agreed. Here it opens on Add and closes on save.
 */
export function DetailList<T extends { id: string }>({
  customerId,
  kind,
  rows,
  columns,
  empty,
  canManage,
  addLabel,
  form,
}: {
  customerId: string;
  /** The API path segment, which is also what the delete action posts. */
  kind: "fuel-surcharges" | "charges" | "volumetrics" | "contacts";
  rows: T[];
  columns: ReadonlyArray<{ header: string; cell: (row: T) => ReactNode; className?: string }>;
  empty: string;
  canManage: boolean;
  addLabel: string;
  /** Rendered inside the panel; `onDone` closes it after a successful save. */
  form: (props: { onDone: () => void }) => ReactNode;
}) {
  const [adding, setAdding] = useState(false);
  const [removeState, removeAction] = useActionState(deleteDetail, null);

  return (
    <>
      <FormError message={removeState?.ok === false ? removeState.error : undefined} />

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {rows.length.toLocaleString()} {rows.length === 1 ? "row" : "rows"}
        </p>
        {canManage ? (
          <button
            type="button"
            onClick={() => setAdding((open) => !open)}
            className="btn-primary rounded-lg px-3 py-2 text-sm font-medium"
          >
            {adding ? "Cancel" : addLabel}
          </button>
        ) : null}
      </div>

      {adding ? <div className="mb-4">{form({ onDone: () => setAdding(false) })}</div> : null}

      <MasterTable
        rows={rows}
        rowKey={(row) => row.id}
        empty={empty}
        columns={[
          ...columns,
          {
            header: "",
            className: "text-right",
            cell: (row) =>
              canManage ? (
                <form action={removeAction} className="flex justify-end">
                  <input type="hidden" name="customerId" value={customerId} />
                  <input type="hidden" name="kind" value={kind} />
                  <input type="hidden" name="id" value={row.id} />
                  <button
                    type="submit"
                    className="rounded border border-line-strong px-2 py-1 text-xs text-red-700 transition-colors hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/50"
                  >
                    Delete
                  </button>
                </form>
              ) : null,
          },
        ]}
      />
    </>
  );
}

/** Closes the panel once the action reports success. */
export function useDetailForm(
  action: (previous: ActionResult | null, form: FormData) => Promise<ActionResult>,
  onDone: () => void,
) {
  const [state, submit, pending] = useActionState(
    async (previous: ActionResult | null, form: FormData) => {
      const result = await action(previous, form);
      if (result.ok) onDone();
      return result;
    },
    null,
  );

  return { state, submit, pending };
}
