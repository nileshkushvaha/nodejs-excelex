"use client";

import { useActionState, useEffect, useState } from "react";

import { MasterDialog } from "@/components/master-dialog";
import { ActiveBadge, MasterTable } from "@/components/master-table";
import { Toggle } from "@/components/toggle";
import type { ActionResult, Department } from "@/lib/api";
import { deleteDepartment, saveDepartment } from "../actions";

const field =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft";

export function DepartmentsManager({
  departments,
  canManage,
}: {
  departments: Department[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<Department | null>(null);
  const [creating, setCreating] = useState(false);
  const [removeState, removeAction] = useActionState(deleteDepartment, null);

  const open = creating || editing !== null;

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
        rows={departments}
        rowKey={(department) => department.id}
        searchable={(department) => `${department.code} ${department.name} ${department.description ?? ""}`}
        placeholder="Search departments…"
        empty="No departments yet."
        actions={
          canManage ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="btn-primary rounded-lg px-3 py-2 text-sm font-medium"
            >
              New department
            </button>
          ) : null
        }
        columns={[
          {
            header: "Code",
            cell: (department) => (
              <span className="font-mono text-xs text-muted">{department.code}</span>
            ),
          },
          {
            header: "Name",
            cell: (department) => (
              <>
                <span className="font-medium text-fg">{department.name}</span>
                {department.description ? (
                  <span className="block text-xs text-muted">{department.description}</span>
                ) : null}
              </>
            ),
          },
          {
            header: "Designations",
            cell: (department) => (
              <span className="text-xs tabular-nums text-muted">{department.designationCount}</span>
            ),
          },
          { header: "Status", cell: (department) => <ActiveBadge active={department.isActive} /> },
          {
            header: "",
            className: "text-right",
            cell: (department) =>
              canManage ? (
                <span className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(department)}
                    className="rounded border border-line-strong px-2 py-1 text-xs text-fg hover:bg-surface-2"
                  >
                    Edit
                  </button>
                  <form action={removeAction}>
                    <input type="hidden" name="id" value={department.id} />
                    <button
                      type="submit"
                      className="rounded border border-line-strong px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/50"
                    >
                      Delete
                    </button>
                  </form>
                </span>
              ) : null,
          },
        ]}
      />

      <DepartmentDialog
        key={editing?.id ?? "new"}
        open={open}
        department={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </>
  );
}

function DepartmentDialog({
  open,
  department,
  onClose,
}: {
  open: boolean;
  department: Department | null;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(saveDepartment, null);

  // Closing on success rather than on submit: a rejected save has to leave the
  // dialog open with its message, or the reason disappears with it.
  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <MasterDialog
      open={open}
      onClose={onClose}
      title={department ? `Edit ${department.name}` : "New department"}
      description="Departments group job titles and, later, the staff who hold them."
    >
      <form action={action} className="space-y-4">
        {department ? <input type="hidden" name="id" value={department.id} /> : null}

        {state && !state.ok ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
          >
            {state.error}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
          <div>
            <label htmlFor="code" className="mb-1 block text-sm font-medium text-fg">
              Code
            </label>
            <input
              id="code"
              name="code"
              required
              minLength={2}
              maxLength={20}
              pattern="[A-Za-z0-9\-]+"
              defaultValue={department?.code}
              placeholder="OPS"
              className={`${field} font-mono uppercase`}
            />
          </div>
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-fg">
              Name
            </label>
            <input
              id="name"
              name="name"
              required
              minLength={2}
              maxLength={80}
              defaultValue={department?.name}
              placeholder="Operations"
              className={field}
            />
          </div>
        </div>

        <div>
          <label htmlFor="description" className="mb-1 block text-sm font-medium text-fg">
            Description
          </label>
          <input
            id="description"
            name="description"
            maxLength={300}
            defaultValue={department?.description ?? ""}
            className={field}
          />
        </div>

        <Toggle
          name="isActive"
          label="Active"
          description="Inactive departments stay on record but are not offered when assigning staff."
          defaultChecked={department?.isActive ?? true}
        />

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {pending ? "Saving…" : department ? "Save changes" : "Create department"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary rounded-lg px-4 py-2 text-sm font-medium"
          >
            Cancel
          </button>
        </div>
      </form>
    </MasterDialog>
  );
}

export type { ActionResult };
