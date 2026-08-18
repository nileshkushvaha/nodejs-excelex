import { getCurrentSession, getCustomers, getDestinationOptions, getProducts, getRates } from "@/lib/api";
import { can } from "@/lib/can";
import { RatesManager } from "./rates-manager";

export const metadata = { title: "Rate cards · ExcelEx" };

export default async function RatesPage({
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
  for (const key of ["page", "pageSize", "customerId", "productId", "originId", "destinationId", "on", "status"]) {
    const value = single(key);
    if (value) query.set(key, value);
  }

  const [page, session, customers, products, destinations] = await Promise.all([
    getRates(query.toString()),
    getCurrentSession(),
    // The first page is enough to filter by: a rate list is browsed by lane
    // far more often than by customer, and the whole customer master would be
    // a second paged request to populate one dropdown.
    getCustomers("page=1&pageSize=100"),
    getProducts(),
    getDestinationOptions(),
  ]);

  if (!page) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">masters.rate.view</code>.
      </p>
    );
  }

  return (
    <div className="animate-fade-up">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Rate cards</h1>
        <p className="mt-0.5 text-sm text-muted">
          What a lane costs, effective from a date. A rate change is a new card, so an invoice
          raised in April is still explainable in September.
        </p>
      </header>

      <RatesManager
        page={page}
        customers={(customers?.rows ?? []).map((row) => ({ id: row.id, code: row.code, name: row.name }))}
        products={(products ?? []).map((row) => ({ id: row.id, code: row.code, name: row.name }))}
        destinations={destinations ?? []}
        canManage={can(session, "zone", "update")}
      />
    </div>
  );
}
