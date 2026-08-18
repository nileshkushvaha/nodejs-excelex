import { AutoRefresh } from "@/components/auto-refresh";
import { getCacheOverview, getCurrentSession } from "@/lib/api";
import { can } from "@/lib/can";
import { CacheManager } from "./cache-manager";

export const metadata = { title: "Cache manager · ExcelEx" };

/**
 * The cache manager. Everything interactive lives in the manager component;
 * this page only fetches, and re-fetches every fifteen seconds through the
 * refresh indicator, so the figures are never more than a quarter of a minute
 * old without a second data path.
 */
export default async function CachePage() {
  const [overview, session] = await Promise.all([getCacheOverview(), getCurrentSession()]);

  if (!overview) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">system.cache.view</code>.
      </p>
    );
  }

  return (
    <div className="animate-fade-up">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Cache manager</h1>
          <p className="mt-0.5 text-sm text-muted">
            What Redis is holding for this account, how often it is asked, and the means to
            clear it when a screen is showing something you have already changed.
          </p>
        </div>
        <AutoRefresh intervalMs={15_000} />
      </header>

      <CacheManager overview={overview} canManage={can(session, "cache", "update")} />
    </div>
  );
}
