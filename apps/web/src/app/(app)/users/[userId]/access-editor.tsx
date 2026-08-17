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
    <p role="alert" className="mt-2 rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 px-3 py-2 text-sm text-red-700 dark:text-red-300">
      {state.error}
    </p>
  );
}

const field =
  "w-full rounded border border-line-strong px-2.5 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft";

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
    <section className="card rounded-xl">
      <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-fg">
        Roles
      </h2>

      {access.roles.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted">No roles assigned.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {access.roles.map((assignment) => (
            <li
              key={`${assignment.roleId}-${assignment.branch?.id ?? "all"}`}
              className="flex items-center justify-between gap-4 px-4 py-2.5"
            >
              <div>
                <p className="text-sm font-medium text-fg">{assignment.name}</p>
                <p className="text-xs text-muted">
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
                    className="rounded border border-line-strong px-2 py-1 text-xs text-fg hover:bg-surface-2"
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
        <form action={assignAction} className="border-t border-line-soft px-4 py-3">
          <input type="hidden" name="userId" value={access.user.id} />
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Role</span>
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
              <span className="mb-1 block text-xs font-medium text-muted">Branch</span>
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
              <span className="mb-1 block text-xs font-medium text-muted">
                Expires <span className="font-normal text-faint">(optional)</span>
              </span>
              <input type="date" name="expiresAt" className={field} />
            </label>

            <button
              type="submit"
              disabled={assigning}
              className="self-end btn-primary rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60"
            >
              {assigning ? "Assigning…" : "Assign"}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-faint">
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
    <section className="card rounded-xl">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-fg">Direct permissions</h2>
        <p className="mt-0.5 text-xs text-muted">
          Granted or denied to this person alone, outside any role. A denial always wins — including
          over a role that grants everything.
        </p>
      </div>

      {access.direct.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted">None.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {access.direct.map((grant) => (
            <li key={grant.permission} className="flex items-start justify-between gap-4 px-4 py-2.5">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                      grant.effect === "DENY"
                        ? "bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300"
                        : "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300"
                    }`}
                  >
                    {grant.effect}
                  </span>
                  <code className="font-mono text-xs text-fg">{grant.permission}</code>
                </p>
                {grant.reason ? (
                  <p className="mt-0.5 text-xs text-muted">{grant.reason}</p>
                ) : null}
                {grant.expiresAt ? (
                  <p className="text-xs text-amber-600 dark:text-amber-300">
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
                    className="rounded border border-line-strong px-2 py-1 text-xs text-fg hover:bg-surface-2"
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
        <form action={setAction} className="border-t border-line-soft px-4 py-3">
          <input type="hidden" name="userId" value={access.user.id} />
          <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Permission</span>
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
              <span className="mb-1 block text-xs font-medium text-muted">Effect</span>
              <select name="effect" className={field} defaultValue="ALLOW">
                <option value="ALLOW">Allow</option>
                <option value="DENY">Deny</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">
                Expires <span className="font-normal text-faint">(optional)</span>
              </span>
              <input type="date" name="expiresAt" className={field} />
            </label>

            <button
              type="submit"
              disabled={saving}
              className="self-end btn-primary rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60"
            >
              {saving ? "Saving…" : "Apply"}
            </button>
          </div>

          <label className="mt-2 block">
            <span className="mb-1 block text-xs font-medium text-muted">
              Reason <span className="font-normal text-faint">(required for a denial)</span>
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
