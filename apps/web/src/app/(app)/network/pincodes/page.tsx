import { getCurrentSession, getDestinationOptions, getPinCodes, getStates, getZones } from "@/lib/api";
import { can } from "@/lib/can";
import { PinCodesManager } from "./pincodes-manager";

export const metadata = { title: "Pin codes · ExcelEx" };

export default async function PinCodesPage({
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
  for (const key of ["page", "pageSize", "search", "destinationId", "zoneId", "status"]) {
    const value = single(key);
    if (value) query.set(key, value);
  }

  const [page, session, destinations, zones, states] = await Promise.all([
    getPinCodes(query.toString()),
    getCurrentSession(),
    getDestinationOptions(),
    getZones(),
    getStates("IN"),
  ]);

  if (!page) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">masters.destination.view</code>.
      </p>
    );
  }

  return (
    <div className="animate-fade-up">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Pin codes</h1>
        <p className="mt-0.5 text-sm text-muted">
          Where an address meets the network: which destination serves a pin code, which zone
          prices it, and whether it is out of delivery area.
        </p>
      </header>

      <PinCodesManager
        page={page}
        destinations={destinations ?? []}
        zones={zones ?? []}
        states={states ?? []}
        canManage={can(session, "pinCode", "update")}
      />
    </div>
  );
}
