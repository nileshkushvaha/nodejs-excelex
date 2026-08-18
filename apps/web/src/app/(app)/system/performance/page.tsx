import { AutoRefresh } from "@/components/auto-refresh";
import { getCurrentSession, getPerformanceHealth, getPerformanceOverview } from "@/lib/api";
import { PerformanceView } from "./performance-view";

export const metadata = { title: "Application performance · ExcelEx" };

/**
 * Application performance for this API instance.
 *
 * Two reads: the overview (everything the window selector affects) and the
 * health strip (which it does not). Both refresh every ten seconds through
 * the indicator, so a live incident shows up without anyone reloading, and
 * there is no second, client-side data path to drift from this one.
 */
export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params["window"];
  const requested = Array.isArray(raw) ? raw[0] : raw;
  const window = requested === "5" || requested === "60" ? requested : "15";

  const query = new URLSearchParams({ window });
  const [overview, health] = await Promise.all([
    getPerformanceOverview(query.toString()),
    getPerformanceHealth(),
    getCurrentSession(),
  ]);

  if (!overview || !health) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">system.performance.view</code>.
      </p>
    );
  }

  return (
    <div className="animate-fade-up">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Application performance</h1>
          <p className="mt-0.5 text-sm text-muted">
            Latency, errors, the event loop, the database and the queues — as seen by this API
            instance over the last few minutes.
          </p>
        </div>
        <AutoRefresh intervalMs={10_000} />
      </header>

      <PerformanceView overview={overview} health={health} window={overview.http.windowMinutes} />
    </div>
  );
}
