import { can } from "@/lib/can";
import {
  getBranches,
  getCurrentSession,
  getCustomers,
  getServiceCentres,
} from "@/lib/api";
import { CustomersManager } from "./customers-manager";

export const metadata = { title: "Customers · ExcelEx" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const single = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  // The filters live in the URL, so a filtered list can be linked, bookmarked
  // and reloaded — and so the back button behaves the way the address bar says.
  const query = new URLSearchParams();
  for (const key of ["page", "pageSize", "search", "branchId", "serviceCentreId", "customerType", "status"]) {
    const value = single(key);
    if (value) query.set(key, value);
  }

  const [page, session, branches, centres] = await Promise.all([
    getCustomers(query.toString()),
    getCurrentSession(),
    getBranches(),
    getServiceCentres(),
  ]);

  if (!page) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">masters.customer.view</code>.
      </p>
    );
  }

  return (
    <div className="animate-fade-up">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Customers</h1>
        <p className="mt-0.5 text-sm text-muted">
          The businesses that ship with you. Rates, surcharges and contacts hang off each one.
        </p>
      </header>

      <CustomersManager
        page={page}
        branches={(branches ?? []).map((row) => ({ id: row.id, code: row.code, name: row.name }))}
        centres={(centres ?? []).map((row) => ({ id: row.id, code: row.code, name: row.name }))}
        canManage={can(session, "customer", "update")}
      />
    </div>
  );
}
