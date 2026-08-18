import { getAccountGroups, getCurrentSession } from "@/lib/api";
import { can } from "@/lib/can";
import { GroupsManager } from "./groups-manager";

export const metadata = { title: "Account groups · ExcelEx" };

export default async function AccountGroupsPage() {
  const [groups, session] = await Promise.all([getAccountGroups(), getCurrentSession()]);

  if (!groups) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">masters.rate.view</code>.
      </p>
    );
  }

  return (
    <div className="animate-fade-up">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Account groups</h1>
        <p className="mt-0.5 text-sm text-muted">
          The chart of accounts. Groups nest — Sundry Debtors sits under Current Assets — and a
          trial balance is summed over that tree.
        </p>
      </header>

      <GroupsManager
        groups={groups}
        canManage={can(session, "zone", "update")}
      />
    </div>
  );
}
