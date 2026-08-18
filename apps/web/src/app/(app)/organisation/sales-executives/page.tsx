import { getCurrentSession, getSalesExecutives } from "@/lib/api";
import { can } from "@/lib/can";
import { SalesExecutivesManager } from "./sales-executives-manager";

export const metadata = { title: "Sales executives · ExcelEx" };

export default async function SalesExecutivesPage() {
  const [executives, session] = await Promise.all([getSalesExecutives(), getCurrentSession()]);

  if (!executives) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">masters.customer.view</code>.
      </p>
    );
  }

  return (
    <div className="animate-fade-up">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Sales executives</h1>
        <p className="mt-0.5 text-sm text-muted">
          The people who own customer relationships. Commission is stored as an exact decimal,
          because it multiplies invoice amounts.
        </p>
      </header>

      <SalesExecutivesManager
        executives={executives}
        canManage={can(session, "customer", "update")}
      />
    </div>
  );
}
