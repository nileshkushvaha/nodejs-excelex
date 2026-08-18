import { AutoRefresh } from "@/components/auto-refresh";
import { getCurrentSession, getJobs, getQueueSummary, getQueuesLive } from "@/lib/api";
import { can } from "@/lib/can";
import { QueuesManager } from "./queues-manager";

export const metadata = { title: "Queue monitor · ExcelEx" };

/**
 * The queue monitor.
 *
 * Three fetches: the live Redis counts (the same for everyone on the
 * deployment), this account's history from Postgres, and the page of jobs
 * the filters describe. Refreshed every ten seconds through the indicator,
 * so a running import can be watched without pressing anything.
 */
export default async function QueuesPage({
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
  for (const key of ["page", "pageSize", "status", "queue", "name", "scheduleId", "search", "from", "to"]) {
    const value = single(key);
    if (value) query.set(key, value);
  }

  const [live, summary, jobs, session] = await Promise.all([
    getQueuesLive(),
    getQueueSummary(),
    getJobs(query.toString()),
    getCurrentSession(),
  ]);

  if (!live || !jobs) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">system.queue.view</code>.
      </p>
    );
  }

  return (
    <div className="animate-fade-up">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Queue monitor</h1>
          <p className="mt-0.5 text-sm text-muted">
            What is waiting, what is running, and what happened to every background job this
            account has asked for.
          </p>
        </div>
        <AutoRefresh intervalMs={10_000} />
      </header>

      <QueuesManager
        live={live}
        summary={summary}
        jobs={jobs}
        canManage={can(session, "job", "update")}
        scheduleId={single("scheduleId") ?? null}
      />
    </div>
  );
}
