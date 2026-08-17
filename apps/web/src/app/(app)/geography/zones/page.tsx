import { getCurrentSession, getZones } from "@/lib/api";
import { ZonesManager } from "./zones-manager";

export const metadata = { title: "Zones · ExcelEx" };

export default async function ZonesPage() {
  const [zones, session] = await Promise.all([getZones(), getCurrentSession()]);

  if (!zones) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">masters.rate.view</code>.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-4xl animate-fade-up">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-fg">Zones</h1>
        <p className="mt-0.5 text-sm text-muted">
          Rating zones. A rate card prices zone pairs rather than every city pair — which is what
          keeps it a few dozen rows instead of a few million.
        </p>
      </header>

      <ZonesManager
        zones={zones}
        canManage={session?.user.permissions.includes("masters.rate.manage") ?? false}
      />
    </div>
  );
}
