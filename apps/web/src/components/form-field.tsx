import type { ReactNode } from "react";

export const formField =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:bg-surface-2 disabled:text-muted";

export function Field({
  label,
  hint,
  error,
  span,
  children,
}: {
  label: string;
  hint?: string;
  /**
   * The API's sentence for this field, from ActionResult.fieldErrors. Shown
   * under the input in place of the hint, so the person sees which box the
   * banner was talking about.
   */
  error?: string;
  span?: 2 | 3 | 4;
  children: ReactNode;
}) {
  const width =
    span === 4 ? "sm:col-span-4" : span === 3 ? "sm:col-span-3" : span === 2 ? "sm:col-span-2" : "";

  return (
    <label className={`block ${width}`}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="mt-1 block text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-faint">{hint}</span>
      ) : null}
    </label>
  );
}

/**
 * The banner above a form.
 *
 * Takes either a message or the ActionResult itself. Given the result it
 * shows the first sentence, lists the rest when the API returned several
 * (a form with three problems should say three things, not one), and
 * prints the reference for a server-side failure so the person has
 * something to quote.
 */
export function FormError({
  message,
  result,
}: {
  message?: string;
  result?: { ok: boolean; error?: string; messages?: string[]; reference?: string; code?: string } | null;
}) {
  const failed = result && result.ok === false ? result : null;
  const headline = message ?? failed?.error;
  if (!headline) return null;

  const rest = (failed?.messages ?? []).filter((entry) => entry !== headline);
  const serverSide = failed?.reference && (failed.code === "internal_error" || failed.code?.endsWith("_unavailable"));

  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
    >
      <p>{headline}</p>
      {rest.length ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
          {rest.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      ) : null}
      {serverSide ? (
        <p className="mt-1 text-xs opacity-80">
          Reference <span className="font-mono">{failed.reference}</span>
        </p>
      ) : null}
    </div>
  );
}
