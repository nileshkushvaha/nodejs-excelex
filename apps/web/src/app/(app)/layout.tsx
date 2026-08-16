import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { Sidebar } from "@/components/sidebar";
import { SignOutButton } from "@/components/sign-out-button";
import { getCurrentSession } from "@/lib/api";

/**
 * The authenticated shell.
 *
 * The session is re-derived from the API on every render of this layout, which
 * is the authorization check — not the proxy, and not anything the browser
 * holds. Next's own guidance is that proxy/middleware "should not be your only
 * line of defense"; here it is not a line of defense at all, only routing.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  return (
    <div className="flex h-dvh bg-slate-50">
      <Sidebar clientName={session.client.host} permissions={session.user.permissions} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {session.client.status ?? "ACTIVE"}
            </span>
            <span className="font-mono">{session.client.host}</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-800">{session.user.fullName}</p>
              <p className="text-xs text-slate-500">{session.user.email}</p>
            </div>
            <SignOutButton />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
