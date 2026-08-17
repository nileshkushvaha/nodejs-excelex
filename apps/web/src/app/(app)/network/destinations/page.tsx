import { getCurrentSession, getDestinationOptions, getDestinations, getStates, getZones } from "@/lib/api";
import { DestinationsManager } from "./destinations-manager";

export const metadata = { title: "Destinations · ExcelEx" };

/**
 * The query lives entirely in the URL, and this server component turns it into
 * one database query. Nothing about the master reaches the browser except the
 * page being looked at.
 */
export default async function DestinationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const query = new URLSearchParams();
  for (const key of [
    "kind", "page", "pageSize", "sort", "direction",
    "code", "name", "countryCode", "stateCode", "serviceType", "status", "search",
  ]) {
    const value = params[key];
    if (typeof value === "string" && value) query.set(key, value);
  }
  if (!query.has("kind")) query.set("kind", "DOMESTIC");

  const [data, session, branches, zones, states] = await Promise.all([
    getDestinations(query.toString()),
    getCurrentSession(),
    getDestinationOptions(),
    getZones(),
    getStates("IN"),
  ]);

  if (!data) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">masters.destination.view</code>.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-7xl animate-fade-up">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Destinations</h1>
        <p className="mt-0.5 text-sm text-muted">
          Servicing points shipments are booked to. Filtering, sorting and paging happen in the
          database — this master runs to thousands of rows.
        </p>
      </header>

      <DestinationsManager
        data={data}
        branches={branches ?? []}
        zones={zones ?? []}
        states={states ?? []}
        canManage={session?.user.permissions.includes("masters.destination.manage") ?? false}
      />
    </div>
  );
}
