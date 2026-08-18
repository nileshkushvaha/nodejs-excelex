import { getCurrentSession, getExceptionGroups, getExceptionSummary } from "@/lib/api";
import { can } from "@/lib/can";
import { ExceptionsManager } from "./exceptions-manager";

export const metadata = { title: "Exceptions · ExcelEx" };

export default async function ExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["page", "pageSize", "status", "source", "search"]) {
    const value = params[key];
    const single = Array.isArray(value) ? value[0] : value;
    if (single) query.set(key, single);
  }
  if (!query.has("status")) query.set("status", "OPEN");

  const [page, summary, session] = await Promise.all([
    getExceptionGroups(query.toString()),
    getExceptionSummary(),
    getCurrentSession(),
  ]);

  if (!page) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">system.exception.view</code>.
      </p>
    );
  }

  return (
    <div className="animate-fade-up">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Exceptions</h1>
        <p className="mt-0.5 text-sm text-muted">
          Server-side failures for this account, grouped by cause. Each carries the reference a
          person would have quoted, so a report and a stack meet here.
        </p>
      </header>
      <ExceptionsManager page={page} summary={summary} canManage={can(session, "exception", "update")} />
    </div>
  );
}
