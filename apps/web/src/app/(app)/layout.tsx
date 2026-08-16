import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
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
    <AppShell
      clientHost={session.client.host}
      clientStatus={session.client.status ?? "ACTIVE"}
      user={{ fullName: session.user.fullName, email: session.user.email }}
      permissions={session.user.permissions}
    >
      {children}
    </AppShell>
  );
}
