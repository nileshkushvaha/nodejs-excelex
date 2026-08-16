import type { ReactNode } from "react";

/**
 * A screen that exists in the navigation but whose module arrives in a later
 * phase. Shown rather than hidden so the roadmap is legible from inside the
 * product, and so the shell's routing is exercised before the module lands.
 */
export function PlaceholderPage({
  title,
  phase,
  description,
  children,
}: {
  title: string;
  phase: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-semibold text-fg">{title}</h1>
        <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted">
          {phase}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-muted">{description}</p>
      {children ? <div className="mt-6">{children}</div> : null}
    </div>
  );
}
