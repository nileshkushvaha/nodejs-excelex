import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getBranches,
  getCurrentSession,
  getPermissionCatalogue,
  getRoles,
  getUserAccess,
} from "@/lib/api";
import { AccessEditor } from "./access-editor";

export const metadata = { title: "User access · ExcelEx" };

export default async function UserAccessPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  const [session, access, roles, branches, catalogue] = await Promise.all([
    getCurrentSession(),
    getUserAccess(userId),
    getRoles(),
    getBranches(),
    getPermissionCatalogue(),
  ]);

  if (!access) notFound();

  const held = session?.user.permissions ?? [];

  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <Link href="/users" className="text-xs text-muted hover:underline">
        ← All users
      </Link>

      <header className="mb-5 mt-2">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{access.user.fullName}</h1>
        <p className="mt-0.5 text-sm text-muted">{access.user.email}</p>
      </header>

      <AccessEditor
        access={access}
        roles={roles ?? []}
        branches={branches ?? []}
        catalogue={catalogue?.permissions ?? []}
        canManageUsers={held.includes("settings.user.manage")}
        canGrantDirect={held.includes("settings.permission.grant")}
      />
    </div>
  );
}
