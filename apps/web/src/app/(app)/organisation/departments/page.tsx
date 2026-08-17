import { getCurrentSession, getDepartments } from "@/lib/api";
import { DepartmentsManager } from "./departments-manager";

export const metadata = { title: "Departments · ExcelEx" };

export default async function DepartmentsPage() {
  const [departments, session] = await Promise.all([getDepartments(), getCurrentSession()]);

  if (!departments) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">masters.organisation.view</code>.
      </p>
    );
  }

  return (
    <div className="animate-fade-up">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Departments</h1>
        <p className="mt-0.5 text-sm text-muted">
          Your own organisation structure. Seeded with the eight a courier company usually runs —
          edit them freely, they are a starting point rather than a constraint.
        </p>
      </header>

      <DepartmentsManager
        departments={departments}
        canManage={session?.user.permissions.includes("masters.organisation.manage") ?? false}
      />
    </div>
  );
}
