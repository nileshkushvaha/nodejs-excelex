import { getCurrentSession, getDashboardSummary } from "@/lib/api";

export const metadata = { title: "Dashboard · ExcelEx" };

function StatCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      <p className="mt-0.5 text-xs text-slate-400">{hint}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const [session, summary] = await Promise.all([getCurrentSession(), getDashboardSummary()]);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">
          Good to see you, {session?.user.fullName.split(" ")[0]}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
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

          <section className="mt-6 rounded-lg border border-slate-200 bg-white">
            <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">
              Recent activity
            </h2>
            {summary.recentActivity.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">Nothing recorded yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {summary.recentActivity.map((event) => (
                  <li key={event.id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs text-slate-800">{event.action}</p>
                      {event.entity ? (
                        <p className="text-xs text-slate-400">{event.entity}</p>
                      ) : null}
                    </div>
                    <time
                      dateTime={event.createdAt}
                      className="shrink-0 pl-4 text-xs tabular-nums text-slate-500"
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
            <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
              Times shown in Asia/Kolkata. Stored in UTC — the timezone is a presentation concern.
            </p>
          </section>
        </>
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          The dashboard summary could not be loaded. Your role may not hold{" "}
          <code className="font-mono">operations.dashboard.view</code>.
        </p>
      )}
    </div>
  );
}
