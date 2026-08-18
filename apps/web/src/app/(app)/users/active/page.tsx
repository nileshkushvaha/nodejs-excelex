import { getAdminSessionSummary, getAdminSessions } from "@/lib/api";
import { ActiveSessionsManager } from "./active-sessions-manager";

export const metadata = { title: "Logged-in users · ExcelEx" };

export default async function ActiveSessionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["page", "pageSize", "search", "userId"]) {
    const value = params[key];
    const single = Array.isArray(value) ? value[0] : value;
    if (single) query.set(key, single);
  }
  const [page, summary] = await Promise.all([getAdminSessions(query.toString()), getAdminSessionSummary()]);

  if (!page) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">settings.session.manage</code>.
      </p>
    );
  }

  return (
    <div className="animate-fade-up">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Logged-in users</h1>
        <p className="mt-0.5 text-sm text-muted">
          Every live session in this account. Ending one signs that device out on its next request;
          the row stays as the record of when it was active.
        </p>
      </header>
      <ActiveSessionsManager page={page} summary={summary} />
    </div>
  );
}
