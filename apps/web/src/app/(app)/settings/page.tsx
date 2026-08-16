import { getCurrentSession } from "@/lib/api";

export const metadata = { title: "Preferences · ExcelEx" };

export default async function SettingsPage() {
  const session = await getCurrentSession();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Preferences</h1>
      <p className="mb-6 text-sm text-slate-500">
        What this session actually holds. Useful while the foundation is being built.
      </p>

      <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        <div className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-sm text-slate-500">Signed in as</dt>
          <dd className="text-sm font-medium text-slate-900">{session?.user.email}</dd>
        </div>
        <div className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-sm text-slate-500">Client host</dt>
          <dd className="font-mono text-sm text-slate-900">{session?.client.host}</dd>
        </div>
        <div className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-sm text-slate-500">Client id</dt>
          <dd className="font-mono text-xs text-slate-500">{session?.client.id}</dd>
        </div>
        <div className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-sm text-slate-500">Time zone</dt>
          <dd className="text-sm text-slate-900">Asia/Kolkata (display) · UTC (stored)</dd>
        </div>
      </dl>

      <h2 className="mt-6 mb-2 text-sm font-semibold text-slate-800">Permissions held</h2>
      <ul className="flex flex-wrap gap-1.5">
        {session?.user.permissions.map((permission) => (
          <li
            key={permission}
            className="rounded bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-700"
          >
            {permission}
          </li>
        ))}
      </ul>
    </div>
  );
}
