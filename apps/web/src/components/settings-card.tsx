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
    <section className="rounded-lg border border-line bg-surface">
      <div className="border-b border-line px-5 py-3">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
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
    <p className="rounded border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/50 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300">
      Saved, but <strong>not yet enforced</strong> — {reason}
    </p>
  );
}

export const numberField =
  "w-24 rounded border border-line-strong px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:bg-surface-2 disabled:text-faint";

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
      <p className="rounded border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
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
        className="rounded bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save settings"}
      </button>
      <span className="text-xs text-muted">
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
