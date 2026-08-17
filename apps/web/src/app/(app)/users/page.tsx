import Link from "next/link";

import { getUsers } from "@/lib/api";
import { UnlockButton } from "./unlock-button";

export const metadata = { title: "Users · ExcelEx" };

export default async function UsersPage() {
  const users = await getUsers();

  if (!users) {
    return (
      <p className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/50 p-4 text-sm text-amber-800 dark:text-amber-300">
        You do not hold <code className="font-mono">settings.user.view</code>.
      </p>
    );
  }

  return (
    <div className="animate-fade-up">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Users</h1>
        <p className="mt-0.5 text-sm text-muted">
          Staff accounts for this client. Accounts are created by invitation — that flow arrives
          with the rest of the authentication milestone.
        </p>
      </header>

      <div className="overflow-hidden card rounded-xl">
        <table className="w-full text-sm">
          <thead className="brand-gradient-soft border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Roles</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Direct grants</th>
              <th className="px-4 py-2 font-medium">Last sign-in</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {users.map((user) => (
              <tr key={user.id} className="row-hover hover:bg-surface-2">
                <td className="px-4 py-2.5">
                  <Link href={`/users/${user.id}`} className="font-medium text-accent-text hover:underline">
                    {user.fullName}
                  </Link>
                  <span className="block text-xs text-muted">{user.email}</span>
                  {!user.isActive ? (
                    <span className="mt-0.5 inline-block rounded bg-surface-3 px-1 text-[10px] uppercase text-muted">
                      inactive
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2.5">
                  {user.roles.length === 0 ? (
                    <span className="text-xs text-faint">none</span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {user.roles.map((role) => (
                        <span
                          key={`${role.roleId}-${role.branchCode ?? "all"}`}
                          className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-fg"
                        >
                          {role.name}
                          {role.branchCode ? (
                            <span className="text-muted"> · {role.branchCode}</span>
                          ) : null}
                          {role.expiresAt ? <span className="text-amber-600 dark:text-amber-300"> · expires</span> : null}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-xs">
                  {user.lockedUntil ? (
                    <UnlockButton userId={user.id} lockedUntil={user.lockedUntil} />
                  ) : user.failedLoginAttempts > 0 ? (
                    <span className="text-amber-700 dark:text-amber-300" title="Consecutive failures since the last success">
                      {user.failedLoginAttempts} failed
                    </span>
                  ) : (
                    <span className="text-faint">ok</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted">
                  {user.directCount === 0 ? (
                    <span className="text-faint">none</span>
                  ) : (
                    <>
                      {user.directCount} total
                      {user.denyCount > 0 ? (
                        <span className="ml-1 rounded bg-red-100 dark:bg-red-900/60 px-1 text-[10px] font-medium text-red-700 dark:text-red-300">
                          {user.denyCount} deny
                        </span>
                      ) : null}
                    </>
                  )}
                </td>
                <td className="px-4 py-2.5 text-xs tabular-nums text-muted">
                  {user.lastLoginAt
                    ? new Date(user.lastLoginAt).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : "never"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
