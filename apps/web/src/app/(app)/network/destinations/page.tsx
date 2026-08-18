import { getCurrentSession, getDestinationOptions, getStates, getZones } from "@/lib/api";
import { can } from "@/lib/can";
import { DestinationsManager } from "./destinations-manager";

export const metadata = { title: "Destinations · ExcelEx" };

export default async function DestinationsPage() {
  const [destinations, session, zones, states] = await Promise.all([
    getDestinationOptions(),
    getCurrentSession(),
    getZones(),
    getStates("IN"),
  ]);

  if (!destinations) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">masters.destination.view</code>.
      </p>
    );
  }

  return (
    <div className="animate-fade-up">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Destinations</h1>
        <p className="mt-0.5 text-sm text-muted">
          Servicing points shipments are booked to.
        </p>
      </header>

      <DestinationsManager
        destinations={destinations}
        zones={zones ?? []}
        states={states ?? []}
        canManage={can(session, "destination", "update")}
      />
    </div>
  );
}
