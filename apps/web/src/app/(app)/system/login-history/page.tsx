import Link from "next/link";

import { MiniBars, formatWhen } from "@/components/mini-bars";
import { getLoginHistory, getLoginHistorySummary } from "@/lib/api";
import { LoginHistoryManager } from "./login-history-manager";

export const metadata = { title: "Login history · ExcelEx" };

const FILTER_KEYS = ["page", "pageSize", "search", "outcome", "from", "to", "userId"] as const;

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
 * Login history.
 *
 * The summary strip answers "is anything wrong right now?" — failures,
 * lockouts, strangers' addresses — before the table answers "what exactly
 * happened?". Locked accounts are listed with a link to the Users screen,
 * where the unlock already lives; this page does not grow a second one.
 */
export default async function LoginHistoryPage({
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

  const exportQuery = new URLSearchParams(query);
  exportQuery.delete("page");
  exportQuery.delete("pageSize");

  const [page, summary] = await Promise.all([
    getLoginHistory(query.toString()),
    getLoginHistorySummary(7),
  ]);

  if (!page) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">system.login.view</code>.
      </p>
    );
  }

  const successRate =
    summary && summary.totals.attempts > 0
      ? `${Math.round((summary.totals.succeeded / summary.totals.attempts) * 100)}%`
      : "—";

  return (
    <div className="animate-fade-up">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Login history</h1>
        <p className="mt-0.5 text-sm text-muted">
          Every sign-in attempt on this account — who, from where, and what happened. Failures are
          kept as they were, including addresses that do not exist here.
        </p>
      </header>

      {summary ? (
        <>
          <div className="mb-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Attempts · 7d" value={summary.totals.attempts} hint="All outcomes" />
            <StatCard label="Success rate" value={successRate} hint={`${summary.totals.succeeded} succeeded`} />
            <StatCard label="Failed" value={summary.totals.failed} hint="Wrong password, unknown, locked" />
            <StatCard label="Locked out" value={summary.totals.lockedOut} hint="Attempts that tripped a lock" />
            <StatCard label="Active sessions" value={summary.activeSessions} hint="Signed in right now" />
            <StatCard label="Unique IPs" value={summary.totals.uniqueIps} hint={`${summary.totals.uniqueUsers} distinct people`} />
          </div>

          <div className="mb-5 grid gap-3 lg:grid-cols-3">
            <div className="card rounded-xl p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">Per day</p>
                <p className="text-[11px] text-faint">
                  <span className="mr-2 inline-block h-2 w-2 rounded-sm bg-accent align-middle" /> succeeded
                  <span className="ml-3 mr-2 inline-block h-2 w-2 rounded-sm bg-red-500/80 align-middle" /> failed
                </p>
              </div>
              <div className="mt-2">
                <MiniBars
                  title="Sign-ins per day"
                  bars={summary.byDay.map((row) => ({ label: row.day, value: row.succeeded, bad: row.failed }))}
                />
              </div>
            </div>

            <div className="card rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Currently locked</p>
              {summary.currentlyLocked.length === 0 ? (
                <p className="mt-2 text-sm text-muted">No accounts are locked.</p>
              ) : (
                <ul className="mt-2 divide-y divide-line-soft text-sm">
                  {summary.currentlyLocked.map((user) => (
                    <li key={user.id} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="min-w-0">
                        <span className="block truncate text-fg">{user.fullName}</span>
                        <span className="block truncate text-xs text-muted">
                          {user.email} · {user.failedLoginAttempts} failed
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-xs text-muted">
                        {new Date(user.lockedUntil).getUTCFullYear() >= 9999
                          ? "until unlocked"
                          : `until ${formatWhen(user.lockedUntil)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/users" className="mt-3 inline-block text-xs font-medium text-accent hover:underline">
                Unlock on the Users screen →
              </Link>
            </div>

            <div className="card rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Most failures</p>
              {summary.topFailingEmails.length === 0 && summary.topIps.length === 0 ? (
                <p className="mt-2 text-sm text-muted">Nothing failed this week.</p>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
                  <ul className="space-y-1">
                    {summary.topFailingEmails.map((row) => (
                      <li key={row.email} className="flex justify-between gap-2">
                        <span className="truncate text-fg" title={row.email}>{row.email}</span>
                        <span className="tabular-nums text-muted">{row.count}</span>
                      </li>
                    ))}
                  </ul>
                  <ul className="space-y-1">
                    {summary.topIps.map((row) => (
                      <li key={row.ip} className="flex justify-between gap-2">
                        <span className="truncate font-mono text-fg" title={row.ip}>{row.ip}</span>
                        <span className="tabular-nums text-muted">{row.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}

      <LoginHistoryManager page={page} exportQuery={exportQuery.toString()} />
    </div>
  );
}
