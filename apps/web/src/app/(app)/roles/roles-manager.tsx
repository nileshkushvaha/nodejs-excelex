"use client";

import { useActionState, useState } from "react";

import { PermissionPicker } from "@/components/permission-picker";
import type { ActionResult, PermissionCatalogueEntry, RoleSummary } from "@/lib/api";
import { createRole, deleteRole, setRolePermissions } from "./actions";

function Feedback({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  if (state.ok) {
    return (
      <p role="status" className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        Saved.
      </p>
    );
  }
  return (
    <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {state.error}
    </p>
  );
}

export function RolesManager({
  roles,
  catalogue,
  canManage,
}: {
  roles: RoleSummary[];
  catalogue: PermissionCatalogueEntry[];
  canManage: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(roles[0]?.id ?? null);
  const [creating, setCreating] = useState(false);

  const selected = roles.find((role) => role.id === selectedId) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Roles</h2>
          {canManage ? (
            <button
              type="button"
              onClick={() => {
                setCreating(true);
                setSelectedId(null);
              }}
              className="rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700"
            >
              New role
            </button>
          ) : null}
        </div>

        <ul className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {roles.map((role) => (
            <li key={role.id}>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(role.id);
                  setCreating(false);
                }}
                className={`w-full border-b border-slate-100 px-3 py-2.5 text-left last:border-b-0 ${
                  role.id === selectedId && !creating ? "bg-sky-50" : "hover:bg-slate-50"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-slate-800">{role.name}</span>
                  {role.isSystem ? (
                    <span className="rounded bg-slate-200 px-1 text-[9px] uppercase tracking-wide text-slate-600">
                      system
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {role.permissions.includes("*")
                    ? "all permissions"
                    : `${role.permissions.length} permissions`}{" "}
                  · {role.assignedUsers} {role.assignedUsers === 1 ? "user" : "users"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section>
        {creating ? (
          <CreateRoleForm catalogue={catalogue} onCancel={() => setCreating(false)} />
        ) : selected ? (
          <EditRoleForm
            key={selected.id}
            role={selected}
            catalogue={catalogue}
            canManage={canManage}
          />
        ) : (
          <p className="text-sm text-slate-500">Select a role.</p>
        )}
      </section>
    </div>
  );
}

function CreateRoleForm({
  catalogue,
  onCancel,
}: {
  catalogue: PermissionCatalogueEntry[];
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(createRole, null);

  return (
    <form action={action} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900">New role</h2>
      <Feedback state={state} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-slate-700">
            Name
          </label>
          <input
            id="name"
            name="name"
            required
            maxLength={60}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </div>
        <div>
          <label htmlFor="description" className="mb-1 block text-sm font-medium text-slate-700">
            Description
          </label>
          <input
            id="description"
            name="description"
            maxLength={300}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </div>
      </div>

      <PermissionPicker permissions={catalogue} selected={[]} />

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create role"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function EditRoleForm({
  role,
  catalogue,
  canManage,
}: {
  role: RoleSummary;
  catalogue: PermissionCatalogueEntry[];
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState(setRolePermissions, null);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteRole, null);

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <input type="hidden" name="roleId" value={role.id} />

        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{role.name}</h2>
            <p className="mt-0.5 text-sm text-slate-500">{role.description ?? "No description."}</p>
          </div>
          <span className="shrink-0 text-xs text-slate-500">
            {role.assignedUsers} {role.assignedUsers === 1 ? "user" : "users"}
          </span>
        </div>

        <Feedback state={state} />

        {!canManage ? (
          <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            You can see this role but not change it. Changing it needs{" "}
            <code className="font-mono">settings.role.manage</code>.
          </p>
        ) : null}

        <PermissionPicker permissions={catalogue} selected={role.permissions} disabled={!canManage} />

        {canManage ? (
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save permissions"}
          </button>
        ) : null}
      </form>

      {canManage && !role.isSystem ? (
        <form action={deleteAction} className="rounded-lg border border-red-200 bg-red-50 p-4">
          <input type="hidden" name="roleId" value={role.id} />
          <Feedback state={deleteState} />
          <p className="mb-2 mt-1 text-sm text-red-800">
            Deleting a role is only possible once no one holds it.
          </p>
          <button
            type="submit"
            disabled={deletePending}
            className="rounded border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
          >
            {deletePending ? "Deleting…" : `Delete “${role.name}”`}
          </button>
        </form>
      ) : null}

      {role.isSystem ? (
        <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          System roles cannot be deleted — a client that deletes its own administrator role locks
          itself out of its account. Their permissions can still be changed.
        </p>
      ) : null}
    </div>
  );
}
