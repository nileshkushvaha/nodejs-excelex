import { getCurrentSession, getDashboardSummary } from "@/lib/api";

export const metadata = { title: "Dashboard · ExcelEx" };

function StatCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    // The brand bar sits along the top edge rather than behind the whole card.
    // A figure has to stay readable, and gradient-filled text is the fastest way
    // to make one that is not — particularly at the dark end of the sweep.
    <div className="card card-interactive group relative overflow-hidden rounded-xl p-4">
      <span
        aria-hidden="true"
        className="brand-gradient absolute inset-x-0 top-0 h-1 opacity-80 transition-opacity group-hover:opacity-100"
      />
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-fg">{value}</p>
      <p className="mt-0.5 text-xs text-faint">{hint}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const [session, summary] = await Promise.all([getCurrentSession(), getDashboardSummary()]);

  return (
    <div className="animate-fade-up">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          Good to see you, {session?.user.fullName.split(" ")[0]}
        </h1>
        <p className="mt-0.5 text-sm text-muted">
          Every figure below is scoped to this client by two independent barriers — the query
          layer and the database itself.
        </p>
      </header>

      {summary ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Active users" value={summary.counts.users} hint="staff who can sign in" />
            <StatCard label="Branches" value={summary.counts.branches} hint="operational locations" />
            <StatCard label="Roles" value={summary.counts.roles} hint="permission sets" />
            <StatCard
              label="Live sessions"
              value={summary.counts.activeSessions}
              hint="not expired or revoked"
            />
          </section>

          <section className="mt-6 card rounded-xl">
            <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-fg">
              Recent activity
            </h2>
            {summary.recentActivity.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">Nothing recorded yet.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {summary.recentActivity.map((event) => (
                  <li key={event.id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs text-fg">{event.action}</p>
                      {event.entity ? (
                        <p className="text-xs text-faint">{event.entity}</p>
                      ) : null}
                    </div>
                    <time
                      dateTime={event.createdAt}
                      className="shrink-0 pl-4 text-xs tabular-nums text-muted"
                    >
                      {new Date(event.createdAt).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-line-soft px-4 py-2 text-xs text-faint">
              Times shown in Asia/Kolkata. Stored in UTC — the timezone is a presentation concern.
            </p>
          </section>
        </>
      ) : (
        <p className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/50 p-4 text-sm text-amber-800 dark:text-amber-300">
          The dashboard summary could not be loaded. Your role may not hold{" "}
          <code className="font-mono">operations.dashboard.view</code>.
        </p>
      )}
    </div>
  );
}
