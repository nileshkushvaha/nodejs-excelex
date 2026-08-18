import {
  getCurrentSession,
  getScheduleOptions,
  getSchedulerStatus,
  getSchedules,
} from "@/lib/api";
import { can } from "@/lib/can";
import { SchedulerManager } from "./scheduler-manager";

export const metadata = { title: "Scheduler · ExcelEx" };

/**
 * The scheduler.
 *
 * The list is this account's; the status card is the dispatcher's, which is
 * one per deployment. Both on one page because "why did my nightly job not
 * run" is answered by looking at both: the schedule's next run, and whether
 * anything is dispatching at all.
 */
export default async function SchedulerPage({
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
  for (const key of ["page", "pageSize", "search", "isActive", "jobName"]) {
    const value = single(key);
    if (value) query.set(key, value);
  }

  const [page, status, options, session] = await Promise.all([
    getSchedules(query.toString()),
    getSchedulerStatus(),
    getScheduleOptions(),
    getCurrentSession(),
  ]);

  if (!page || !options) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">system.schedule.view</code>.
      </p>
    );
  }

  return (
    <div className="animate-fade-up">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Scheduler</h1>
        <p className="mt-0.5 text-sm text-muted">
          Work that runs on a timetable — what, when, in which timezone, and how the last run went.
        </p>
      </header>

      <SchedulerManager
        page={page}
        status={status}
        options={options}
        canManage={can(session, "jobSchedule", "update")}
      />
    </div>
  );
}
