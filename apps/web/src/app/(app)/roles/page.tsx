import { RolesManager } from "./roles-manager";
import { getCurrentSession, getPermissionCatalogue, getRoles } from "@/lib/api";

export const metadata = { title: "Roles · ExcelEx" };

export default async function RolesPage() {
  const [session, roles, catalogue] = await Promise.all([
    getCurrentSession(),
    getRoles(),
    getPermissionCatalogue(),
  ]);

  if (!roles || !catalogue) {
    return (
      <p className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/50 p-4 text-sm text-amber-800 dark:text-amber-300">
        You do not hold <code className="font-mono">settings.role.view</code>.
      </p>
    );
  }

  // Presentation only. The API re-checks this on every mutation, so hiding the
  // save button is a courtesy, not the control.
  const canManage = session?.user.permissions.includes("settings.role.manage") ?? false;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-fg">Roles</h1>
        <p className="mt-0.5 text-sm text-muted">
          A role is a named set of permissions. You can only grant what you hold yourself — the API
          refuses anything else, whatever this page shows.
        </p>
      </header>

      <RolesManager roles={roles} catalogue={catalogue.permissions} canManage={canManage} />
    </div>
  );
}
