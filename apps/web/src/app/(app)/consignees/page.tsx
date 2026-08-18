import { getConsignees, getCurrentSession, getDestinationOptions, getServiceCentres } from "@/lib/api";
import { ConsigneesManager } from "./consignees-manager";

export const metadata = { title: "Consignees · ExcelEx" };

export default async function ConsigneesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const single = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const query = new URLSearchParams();
  for (const key of ["page", "pageSize", "search", "destinationId", "serviceCentreId", "status"]) {
    const value = single(key);
    if (value) query.set(key, value);
  }

  const [page, session, destinations, centres] = await Promise.all([
    getConsignees(query.toString()),
    getCurrentSession(),
    getDestinationOptions(),
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
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Consignees</h1>
        <p className="mt-0.5 text-sm text-muted">
          The parties goods are delivered to. Shared across customers — the same consignee receives
          from several of them.
        </p>
      </header>

      <ConsigneesManager
        page={page}
        destinations={destinations ?? []}
        centres={(centres ?? []).map((row) => ({ id: row.id, code: row.code, name: row.name }))}
        canManage={session?.user.permissions.includes("masters.customer.manage") ?? false}
      />
    </div>
  );
}
