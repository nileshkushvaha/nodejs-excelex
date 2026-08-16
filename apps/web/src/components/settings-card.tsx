import type { ReactNode } from "react";

export function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

/**
 * Marks a control whose value is stored but not acted on.
 *
 * A toggle that looks like it works and does not is worse than an absent one:
 * someone turns on "notify admin on lockout", assumes they will hear about
 * lockouts, and finds out otherwise during an incident.
 */
export function NotEnforced({ reason }: { reason: string }) {
  return (
    <p className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
      Saved, but <strong>not yet enforced</strong> — {reason}
    </p>
  );
}

export const numberField =
  "w-24 rounded border border-slate-300 px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-50 disabled:text-slate-400";

export function SaveBar({
  pending,
  updatedAt,
  canManage,
}: {
  pending: boolean;
  updatedAt: string | null;
  canManage: boolean;
}) {
  if (!canManage) {
    return (
      <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        You can read these settings but not change them. Changing them needs{" "}
        <code className="font-mono">settings.security.manage</code>.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save settings"}
      </button>
      <span className="text-xs text-slate-500">
        {updatedAt
          ? `Last changed ${new Date(updatedAt).toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
              dateStyle: "medium",
              timeStyle: "short",
            })}`
          : "Never changed — showing defaults."}
      </span>
    </div>
  );
}
