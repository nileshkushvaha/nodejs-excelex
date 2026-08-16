"use client";

import type { ActionResult } from "@/lib/api";

export const field =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft";

export function Feedback({ state, okMessage }: { state: ActionResult | null; okMessage: string }) {
  if (!state) return null;

  return state.ok ? (
    <p role="status" className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/50 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
      {okMessage}
    </p>
  ) : (
    <p role="alert" className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 px-3 py-2 text-sm text-red-700 dark:text-red-300">
      {state.error}
    </p>
  );
}

export function Card({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 rounded-xl border border-line bg-surface">
      <div className="border-b border-line px-5 py-3.5">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
