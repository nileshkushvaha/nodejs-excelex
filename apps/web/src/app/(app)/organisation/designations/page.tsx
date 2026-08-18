import { getCurrentSession, getDepartments, getDesignations } from "@/lib/api";
import { can } from "@/lib/can";
import { DesignationsManager } from "./designations-manager";

export const metadata = { title: "Designations · ExcelEx" };

export default async function DesignationsPage() {
  const [designations, departments, session] = await Promise.all([
    getDesignations(),
    getDepartments(),
    getCurrentSession(),
  ]);

  if (!designations) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">masters.organisation.view</code>.
      </p>
    );
  }

  return (
    <div className="animate-fade-up">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Designations</h1>
        <p className="mt-0.5 text-sm text-muted">
          Job titles, ordered by seniority. A title that sits above any one department — a Managing
          Director — belongs to none rather than to an invented “General” bucket.
        </p>
      </header>

      <DesignationsManager
        designations={designations}
        departments={departments ?? []}
        canManage={can(session, "department", "update")}
      />
    </div>
  );
}
