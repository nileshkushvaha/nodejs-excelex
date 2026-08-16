"use client";

import { useActionState } from "react";

import type {
  ActionResult,
  Branch,
  PermissionCatalogueEntry,
  RoleSummary,
  UserAccess,
} from "@/lib/api";
import {
  assignRole,
  clearDirectPermission,
  setDirectPermission,
  unassignRole,
} from "../actions";

function Feedback({ state }: { state: ActionResult | null }) {
  if (!state?.error) return null;
  return (
    <p role="alert" className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {state.error}
    </p>
  );
}

const field =
  "w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100";

export function AccessEditor({
  access,
  roles,
  branches,
  catalogue,
  canManageUsers,
  canGrantDirect,
}: {
  access: UserAccess;
  roles: RoleSummary[];
  branches: Branch[];
  catalogue: PermissionCatalogueEntry[];
  canManageUsers: boolean;
  canGrantDirect: boolean;
}) {
  return (
    <div className="space-y-6">
      <RolesSection
        access={access}
        roles={roles}
        branches={branches}
        canManage={canManageUsers}
      />
      <DirectSection access={access} catalogue={catalogue} canGrant={canGrantDirect} />
    </div>
  );
}

function RolesSection({
  access,
  roles,
  branches,
  canManage,
}: {
  access: UserAccess;
  roles: RoleSummary[];
  branches: Branch[];
  canManage: boolean;
}) {
  const [assignState, assignAction, assigning] = useActionState(assignRole, null);
  const [removeState, removeAction] = useActionState(unassignRole, null);

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">
        Roles
      </h2>

      {access.roles.length === 0 ? (
        <p className="px-4 py-4 text-sm text-slate-500">No roles assigned.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {access.roles.map((assignment) => (
            <li
              key={`${assignment.roleId}-${assignment.branch?.id ?? "all"}`}
              className="flex items-center justify-between gap-4 px-4 py-2.5"
            >
              <div>
                <p className="text-sm font-medium text-slate-800">{assignment.name}</p>
                <p className="text-xs text-slate-500">
                  {assignment.branch ? `Branch ${assignment.branch.code}` : "All branches"}
                  {assignment.expiresAt
                    ? ` · expires ${new Date(assignment.expiresAt).toLocaleDateString("en-IN")}`
                    : ""}
                </p>
              </div>

              {canManage ? (
                <form action={removeAction}>
                  <input type="hidden" name="userId" value={access.user.id} />
                  <input type="hidden" name="roleId" value={assignment.roleId} />
                  <input type="hidden" name="branchId" value={assignment.branch?.id ?? ""} />
                  <button
                    type="submit"
                    className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    Remove
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div className="px-4">
        <Feedback state={removeState} />
      </div>

      {canManage ? (
        <form action={assignAction} className="border-t border-slate-100 px-4 py-3">
          <input type="hidden" name="userId" value={access.user.id} />
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Role</span>
              <select name="roleId" required className={field} defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Branch</span>
              <select name="branchId" className={field} defaultValue="">
                <option value="">All branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.code} — {branch.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">
                Expires <span className="font-normal text-slate-400">(optional)</span>
              </span>
              <input type="date" name="expiresAt" className={field} />
            </label>

            <button
              type="submit"
              disabled={assigning}
              className="self-end rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
            >
              {assigning ? "Assigning…" : "Assign"}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            A branch-scoped role still grants the permission; the branch limits which records it
            applies to.
          </p>
          <Feedback state={assignState} />
        </form>
      ) : null}
    </section>
  );
}

function DirectSection({
  access,
  catalogue,
  canGrant,
}: {
  access: UserAccess;
  catalogue: PermissionCatalogueEntry[];
  canGrant: boolean;
}) {
  const [setState, setAction, saving] = useActionState(setDirectPermission, null);
  const [clearState, clearAction] = useActionState(clearDirectPermission, null);

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Direct permissions</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Granted or denied to this person alone, outside any role. A denial always wins — including
          over a role that grants everything.
        </p>
      </div>

      {access.direct.length === 0 ? (
        <p className="px-4 py-4 text-sm text-slate-500">None.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {access.direct.map((grant) => (
            <li key={grant.permission} className="flex items-start justify-between gap-4 px-4 py-2.5">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                      grant.effect === "DENY"
                        ? "bg-red-100 text-red-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {grant.effect}
                  </span>
                  <code className="font-mono text-xs text-slate-800">{grant.permission}</code>
                </p>
                {grant.reason ? (
                  <p className="mt-0.5 text-xs text-slate-500">{grant.reason}</p>
                ) : null}
                {grant.expiresAt ? (
                  <p className="text-xs text-amber-600">
                    expires {new Date(grant.expiresAt).toLocaleDateString("en-IN")}
                  </p>
                ) : null}
              </div>

              {canGrant ? (
                <form action={clearAction}>
                  <input type="hidden" name="userId" value={access.user.id} />
                  <input type="hidden" name="permission" value={grant.permission} />
                  <button
                    type="submit"
                    className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    Clear
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div className="px-4">
        <Feedback state={clearState} />
      </div>

      {canGrant ? (
        <form action={setAction} className="border-t border-slate-100 px-4 py-3">
          <input type="hidden" name="userId" value={access.user.id} />
          <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Permission</span>
              <select name="permission" required className={field} defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                {catalogue.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    {entry.group} — {entry.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Effect</span>
              <select name="effect" className={field} defaultValue="ALLOW">
                <option value="ALLOW">Allow</option>
                <option value="DENY">Deny</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">
                Expires <span className="font-normal text-slate-400">(optional)</span>
              </span>
              <input type="date" name="expiresAt" className={field} />
            </label>

            <button
              type="submit"
              disabled={saving}
              className="self-end rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Apply"}
            </button>
          </div>

          <label className="mt-2 block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Reason <span className="font-normal text-slate-400">(required for a denial)</span>
            </span>
            <input
              name="reason"
              maxLength={300}
              placeholder="Why is this person's access being changed?"
              className={field}
            />
          </label>

          <Feedback state={setState} />
        </form>
      ) : null}
    </section>
  );
}
