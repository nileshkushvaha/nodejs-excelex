import Link from "next/link";

import { getUsers } from "@/lib/api";

export const metadata = { title: "Users · ExcelEx" };

export default async function UsersPage() {
  const users = await getUsers();

  if (!users) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        You do not hold <code className="font-mono">settings.user.view</code>.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900">Users</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Staff accounts for this client. Accounts are created by invitation — that flow arrives
          with the rest of the authentication milestone.
        </p>
      </header>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Roles</th>
              <th className="px-4 py-2 font-medium">Direct grants</th>
              <th className="px-4 py-2 font-medium">Last sign-in</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5">
                  <Link href={`/users/${user.id}`} className="font-medium text-sky-700 hover:underline">
                    {user.fullName}
                  </Link>
                  <span className="block text-xs text-slate-500">{user.email}</span>
                  {!user.isActive ? (
                    <span className="mt-0.5 inline-block rounded bg-slate-200 px-1 text-[10px] uppercase text-slate-600">
                      inactive
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2.5">
                  {user.roles.length === 0 ? (
                    <span className="text-xs text-slate-400">none</span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {user.roles.map((role) => (
                        <span
                          key={`${role.roleId}-${role.branchCode ?? "all"}`}
                          className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700"
                        >
                          {role.name}
                          {role.branchCode ? (
                            <span className="text-slate-500"> · {role.branchCode}</span>
                          ) : null}
                          {role.expiresAt ? <span className="text-amber-600"> · expires</span> : null}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-600">
                  {user.directCount === 0 ? (
                    <span className="text-slate-400">none</span>
                  ) : (
                    <>
                      {user.directCount} total
                      {user.denyCount > 0 ? (
                        <span className="ml-1 rounded bg-red-100 px-1 text-[10px] font-medium text-red-700">
                          {user.denyCount} deny
                        </span>
                      ) : null}
                    </>
                  )}
                </td>
                <td className="px-4 py-2.5 text-xs tabular-nums text-slate-500">
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
