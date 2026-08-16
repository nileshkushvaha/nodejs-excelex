"use client";

import { useActionState, useEffect, useState } from "react";

import { MasterDialog } from "@/components/master-dialog";
import { ActiveBadge, MasterTable } from "@/components/master-table";
import { Toggle } from "@/components/toggle";
import type { Department, Designation } from "@/lib/api";
import { deleteDesignation, saveDesignation } from "../actions";

const field =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft";

export function DesignationsManager({
  designations,
  departments,
  canManage,
}: {
  designations: Designation[];
  departments: Department[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<Designation | null>(null);
  const [creating, setCreating] = useState(false);
  const [removeState, removeAction] = useActionState(deleteDesignation, null);

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
        rows={designations}
        rowKey={(designation) => designation.id}
        searchable={(designation) =>
          `${designation.code} ${designation.name} ${designation.department?.name ?? ""} ${designation.description ?? ""}`
        }
        placeholder="Search designations…"
        empty="No designations yet."
        actions={
          canManage ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
            >
              New designation
            </button>
          ) : null
        }
        columns={[
          {
            header: "Code",
            cell: (designation) => (
              <span className="font-mono text-xs text-muted">{designation.code}</span>
            ),
          },
          {
            header: "Title",
            cell: (designation) => (
              <>
                <span className="font-medium text-fg">{designation.name}</span>
                {designation.description ? (
                  <span className="block text-xs text-muted">{designation.description}</span>
                ) : null}
              </>
            ),
          },
          {
            header: "Department",
            cell: (designation) =>
              designation.department ? (
                <span className="text-xs text-muted">{designation.department.name}</span>
              ) : (
                // A title above any one department, not a missing value.
                <span className="text-xs italic text-faint">Company-wide</span>
              ),
          },
          {
            header: "Level",
            cell: (designation) => (
              <span className="text-xs tabular-nums text-muted">{designation.level}</span>
            ),
          },
          { header: "Status", cell: (designation) => <ActiveBadge active={designation.isActive} /> },
          {
            header: "",
            className: "text-right",
            cell: (designation) =>
              canManage ? (
                <span className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(designation)}
                    className="rounded border border-line-strong px-2 py-1 text-xs text-fg hover:bg-surface-2"
                  >
                    Edit
                  </button>
                  <form action={removeAction}>
                    <input type="hidden" name="id" value={designation.id} />
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

      <DesignationDialog
        key={editing?.id ?? "new"}
        open={creating || editing !== null}
        designation={editing}
        departments={departments}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </>
  );
}

function DesignationDialog({
  open,
  designation,
  departments,
  onClose,
}: {
  open: boolean;
  designation: Designation | null;
  departments: Department[];
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(saveDesignation, null);

  // Closing on success rather than on submit: a rejected save has to leave the
  // dialog open with its message, or the reason disappears with it.
  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <MasterDialog
      open={open}
      onClose={onClose}
      title={designation ? `Edit ${designation.name}` : "New designation"}
      description="A job title. Leave the department blank for a title that sits above any one of them."
    >
      <form action={action} className="space-y-4">
        {designation ? <input type="hidden" name="id" value={designation.id} /> : null}

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
              defaultValue={designation?.code}
              placeholder="OPS-SUP"
              className={`${field} font-mono uppercase`}
            />
          </div>
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-fg">
              Title
            </label>
            <input
              id="name"
              name="name"
              required
              minLength={2}
              maxLength={80}
              defaultValue={designation?.name}
              placeholder="Operations Supervisor"
              className={field}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
          <div>
            <label htmlFor="departmentId" className="mb-1 block text-sm font-medium text-fg">
              Department
            </label>
            <select
              id="departmentId"
              name="departmentId"
              defaultValue={designation?.department?.id ?? ""}
              className={field}
            >
              <option value="">Company-wide</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="level" className="mb-1 block text-sm font-medium text-fg">
              Level
            </label>
            <input
              id="level"
              name="level"
              type="number"
              min={0}
              max={1000}
              defaultValue={designation?.level ?? 0}
              className={`${field} tabular-nums`}
            />
          </div>
        </div>

        <p className="text-xs text-muted">
          Level is seniority, low to high. It orders this list and will decide approval chains later,
          so leaving gaps between values makes inserting a grade easier than renumbering everything.
        </p>

        <div>
          <label htmlFor="description" className="mb-1 block text-sm font-medium text-fg">
            Description
          </label>
          <input
            id="description"
            name="description"
            maxLength={300}
            defaultValue={designation?.description ?? ""}
            className={field}
          />
        </div>

        <Toggle name="isActive" label="Active" defaultChecked={designation?.isActive ?? true} />

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
          >
            {pending ? "Saving…" : designation ? "Save changes" : "Create designation"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium text-fg hover:bg-surface-2"
          >
            Cancel
          </button>
        </div>
      </form>
    </MasterDialog>
  );
}
