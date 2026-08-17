import {
  getCurrentSession,
  getDestinationOptions,
  getServiceCentres,
  getStates,
} from "@/lib/api";
import { ServiceCentresManager } from "./service-centres-manager";

export const metadata = { title: "Service centres · ExcelEx" };

export default async function ServiceCentresPage() {
  const [centres, session, destinations, states] = await Promise.all([
    getServiceCentres(),
    getCurrentSession(),
    getDestinationOptions(),
    getStates("IN"),
  ]);

  if (!centres) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">masters.branch.view</code>.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Service centres</h1>
        <p className="mt-0.5 text-sm text-muted">
          The registered entities that issue invoices. Each carries its own GST registration, bank
          account and document numbering — an invoice has to show the details of the entity that
          raised it.
        </p>
      </header>

      <ServiceCentresManager
        centres={centres}
        destinations={destinations ?? []}
        states={states ?? []}
        canManage={session?.user.permissions.includes("masters.branch.manage") ?? false}
      />
    </div>
  );
}
