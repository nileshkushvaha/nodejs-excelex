"use client";

import {
  Children,
  createContext,
  isValidElement,
  useContext,
  type ComponentProps,
  type ReactNode,
} from "react";

export const formField =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:bg-surface-2 disabled:text-muted";

/**
 * The API's field-level errors for the form being rendered.
 *
 * Provided once per form from the action's result; read by every Field
 * inside it. Fields find their own entry by the `name` of the input they
 * wrap, which is the same key the server action posts and the same path the
 * API's validation reports — so nothing has to be threaded through by hand,
 * and a form gets field-level errors by wrapping its body once.
 */
const FieldErrorsContext = createContext<Readonly<Record<string, string>> | undefined>(undefined);

export function FieldErrorsProvider({
  errors,
  children,
}: {
  errors: Readonly<Record<string, string>> | undefined;
  children: ReactNode;
}) {
  return <FieldErrorsContext.Provider value={errors}>{children}</FieldErrorsContext.Provider>;
}

/**
 * A <form> that also provides its result's field errors to the Fields inside.
 *
 * Exists so adopting field-level errors is a one-word change per form —
 * `<form>` becomes `<Form errors={state?.fieldErrors}>` — rather than a new
 * wrapper element and a re-indented body in every file.
 */
export function Form({
  errors,
  children,
  ...rest
}: ComponentProps<"form"> & { errors: Readonly<Record<string, string>> | undefined }) {
  return (
    <form {...rest}>
      <FieldErrorsProvider errors={errors}>{children}</FieldErrorsProvider>
    </form>
  );
}

export function Field({
  label,
  hint,
  error,
  name,
  span,
  children,
}: {
  label: string;
  hint?: string;
  /**
   * The API's sentence for this field. Shown under the input in place of the
   * hint, so the person sees which box the banner was talking about. Given
   * explicitly, or found in the form's FieldErrorsProvider under the wrapped
   * input's `name`.
   */
  error?: string;
  /** Overrides the inferred name when the input is not a direct child. */
  name?: string;
  span?: 2 | 3 | 4;
  children: ReactNode;
}) {
  const width =
    span === 4 ? "sm:col-span-4" : span === 3 ? "sm:col-span-3" : span === 2 ? "sm:col-span-2" : "";

  const provided = useContext(FieldErrorsContext);
  const inferred = name ?? inputName(children);
  const shown = error ?? (provided && inferred ? provided[inferred] : undefined);

  return (
    <label className={`block ${width}`}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {shown ? (
        <span role="alert" className="mt-1 block text-xs text-red-600 dark:text-red-400">
          {shown}
        </span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-faint">{hint}</span>
      ) : null}
    </label>
  );
}

/** The `name` of the one input a Field wraps, when it is a direct child. */
function inputName(children: ReactNode): string | undefined {
  const only = Children.toArray(children).find(isValidElement);
  const props = only && isValidElement(only) ? (only.props as { name?: unknown }) : undefined;
  return typeof props?.name === "string" ? props.name : undefined;
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
