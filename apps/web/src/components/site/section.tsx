import type { ReactNode } from "react";

import { Reveal } from "./reveal";

/**
 * A page section, with the heading treatment every one of them shares.
 *
 * Sections differ in content, not in rhythm — the same width, the same
 * spacing, the same eyebrow-then-title. Keeping that here is what stops six
 * pages from drifting into six layouts.
 */
export function Section({
  eyebrow,
  title,
  intro,
  children,
  tone = "canvas",
  id,
}: {
  eyebrow?: string;
  title?: string;
  intro?: string;
  children?: ReactNode;
  /** Alternating bands, so a long page reads as parts rather than a scroll. */
  tone?: "canvas" | "surface";
  id?: string;
}) {
  return (
    <section
      id={id}
      // scroll-mt clears the fixed header: without it an in-page link leaves
      // the heading it jumped to underneath the navigation.
      className={`scroll-mt-24 border-t border-line ${
        tone === "surface" ? "bg-surface" : "bg-canvas"
      }`}
    >
      <div className="mx-auto max-w-6xl px-5 py-20">
        {title ? (
          <Reveal className="mb-12 max-w-2xl">
            {eyebrow ? (
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent-text">
                {eyebrow}
              </p>
            ) : null}
            <h2 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{title}</h2>
            {intro ? <p className="mt-3 text-base leading-relaxed text-muted">{intro}</p> : null}
          </Reveal>
        ) : null}

        {children}
      </div>
    </section>
  );
}

/** The banner strip that ends a page: one decision, stated once. */
export function CallToAction({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-line bg-canvas">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <Reveal>
          <div className="brand-gradient relative overflow-hidden rounded-2xl px-8 py-14 text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/80">{body}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">{children}</div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
