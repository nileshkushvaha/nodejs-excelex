import { MiniBars } from "@/components/mini-bars";
import { getActivity, getActivityFacets, getActivitySummary } from "@/lib/api";
import { ActivityManager } from "./activity-manager";

export const metadata = { title: "Activity log · ExcelEx" };

const FILTER_KEYS = [
  "page",
  "pageSize",
  "search",
  "actorId",
  "actionPrefix",
  "action",
  "entity",
  "from",
  "to",
] as const;

function StatCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="card card-interactive group relative overflow-hidden rounded-xl p-4">
      <span
        aria-hidden="true"
        className="brand-gradient absolute inset-x-0 top-0 h-1 opacity-80 transition-opacity group-hover:opacity-100"
      />
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 truncate text-3xl font-bold tabular-nums text-fg">{value}</p>
      <p className="mt-0.5 truncate text-xs text-faint">{hint}</p>
    </div>
  );
}

/**
 * The activity log.
 *
 * Filters live in the URL so a view is a link: an administrator can send
 * "everything this person did on Tuesday" to a colleague as an address. The
 * date inputs are turned into ISO instants here — the start of the from-day
 * and the end of the to-day — so the API's filter is unambiguous whatever
 * the browser's locale.
 */
export default async function ActivityPage({
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
  for (const key of FILTER_KEYS) {
    const value = single(key);
    if (!value) continue;
    if (key === "from") query.set("from", `${value}T00:00:00.000Z`);
    else if (key === "to") query.set("to", `${value}T23:59:59.999Z`);
    else query.set(key, value);
  }

  // The export takes the filters, never the page: it is the whole answer.
  const exportQuery = new URLSearchParams(query);
  exportQuery.delete("page");
  exportQuery.delete("pageSize");

  const [page, facets, summary] = await Promise.all([
    getActivity(query.toString()),
    getActivityFacets(),
    getActivitySummary(7),
  ]);

  if (!page) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">settings.audit.view</code>.
      </p>
    );
  }

  const topAction = summary?.topActions[0];

  return (
    <div className="animate-fade-up">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Activity log</h1>
        <p className="mt-0.5 text-sm text-muted">
          Who did what, when, from where. Append-only: nothing here can be edited.
        </p>
      </header>

      {summary ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Events · 7 days" value={summary.totals.events} hint="Everything written to the trail" />
          <StatCard label="People active" value={summary.totals.actors} hint="Distinct actors in the window" />
          <StatCard
            label="Top action"
            value={topAction ? topAction.label : "—"}
            hint={topAction ? `${topAction.count} times · ${topAction.action}` : "No events yet"}
          />
          <div className="card rounded-xl p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Per day</p>
            <div className="mt-2">
              <MiniBars
                title="Events per day"
                bars={summary.totals.perDay.map((row) => ({ label: row.day, value: row.count }))}
              />
            </div>
          </div>
        </div>
      ) : null}

      <ActivityManager
        page={page}
        facets={facets ?? { domains: [], entities: [], actors: [] }}
        exportQuery={exportQuery.toString()}
      />
    </div>
  );
}
