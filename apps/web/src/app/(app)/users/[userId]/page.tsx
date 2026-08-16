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
    <div className="mx-auto max-w-3xl">
      <Link href="/users" className="text-xs text-slate-500 hover:underline">
        ← All users
      </Link>

      <header className="mb-5 mt-2">
        <h1 className="text-xl font-semibold text-slate-900">{access.user.fullName}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{access.user.email}</p>
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
