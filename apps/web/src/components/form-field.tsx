import type { ReactNode } from "react";

export const formField =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:bg-surface-2 disabled:text-muted";

export function Field({
  label,
  hint,
  span,
  children,
}: {
  label: string;
  hint?: string;
  span?: 2 | 3 | 4;
  children: ReactNode;
}) {
  const width =
    span === 4 ? "sm:col-span-4" : span === 3 ? "sm:col-span-3" : span === 2 ? "sm:col-span-2" : "";

  return (
    <label className={`block ${width}`}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-faint">{hint}</span> : null}
    </label>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
    >
      {message}
    </p>
  );
}
