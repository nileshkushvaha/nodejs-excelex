import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The shell every add/edit screen sits in.
 *
 * These are routes rather than modals. A modal is right for a decision with two
 * fields; a service centre carries four panels and forty, and a dialog that
 * scrolls internally hides both the thing you are editing and the save button.
 * A route is also linkable, survives a refresh, and gives the back button the
 * meaning a user already expects.
 */
export function FormPage({
  backHref,
  backLabel,
  title,
  description,
  children,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl animate-fade-up">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-fg"
      >
        <span aria-hidden="true">←</span> {backLabel}
      </Link>

      <header className="mb-5 mt-2">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </header>

      {children}
    </div>
  );
}

/** A titled panel, matching the grouped layout of the legacy forms. */
export function FormPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="card rounded-xl">
      <legend className="brand-gradient ml-4 rounded-full px-3 py-0.5 text-xs font-semibold text-white">
        {title}
      </legend>
      <div className="p-5 pt-3">{children}</div>
    </fieldset>
  );
}

/** The sticky action bar. Kept in view so a long form never hides its own save. */
export function FormActions({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="sticky bottom-0 -mx-1 flex flex-wrap gap-2 border-t border-line bg-canvas/85 px-1 py-3 backdrop-blur">
      {children}
    </div>
  );
}
