import { getCurrentSession, getDestinationOptions, getServiceCentres, getShippers } from "@/lib/api";
import { can } from "@/lib/can";
import { ShippersManager } from "./shippers-manager";

export const metadata = { title: "Shippers · ExcelEx" };

export default async function ShippersPage({
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
  for (const key of ["page", "pageSize", "search", "originId", "serviceCentreId", "status"]) {
    const value = single(key);
    if (value) query.set(key, value);
  }

  const [page, session, origins, centres] = await Promise.all([
    getShippers(query.toString()),
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
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Shippers</h1>
        <p className="mt-0.5 text-sm text-muted">
          The parties goods are collected from. A shipper is the exporter of record, so its customs
          and banking details live here.
        </p>
      </header>

      <ShippersManager
        page={page}
        origins={origins ?? []}
        centres={(centres ?? []).map((row) => ({ id: row.id, code: row.code, name: row.name }))}
        canManage={can(session, "customer", "update")}
      />
    </div>
  );
}
