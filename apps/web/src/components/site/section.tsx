import type { ReactNode } from "react";

import { ArcArt } from "./artwork";
import { Reveal } from "./reveal";

/**
 * A page section, with the rhythm every one of them shares.
 *
 * Sections differ in content, not in shape — same width, same spacing, same
 * eyebrow-then-title. Keeping that here is what stops six pages becoming six
 * layouts. `tone` picks which of the two backgrounds it sits on: plain canvas,
 * or a lit band with its own aurora for the sections that need to carry
 * weight.
 */
export function Section({
  eyebrow,
  title,
  intro,
  children,
  tone = "canvas",
  id,
  centered = false,
}: {
  eyebrow?: string;
  title?: string;
  intro?: string;
  children?: ReactNode;
  tone?: "canvas" | "lit";
  id?: string;
  centered?: boolean;
}) {
  return (
    <section
      id={id}
      // scroll-mt clears the fixed header: without it an in-page link leaves
      // the heading it jumped to underneath the navigation.
      className={`relative isolate scroll-mt-24 overflow-hidden ${
        tone === "lit" ? "border-y border-line bg-surface/40" : ""
      }`}
    >
      {tone === "lit" ? (
        <>
          <div aria-hidden className="aurora -z-20 opacity-60" />
          <div aria-hidden className="grain -z-10" />
        </>
      ) : null}

      <div className="mx-auto max-w-6xl px-5 py-24">
        {title ? (
          <Reveal className={`mb-14 max-w-2xl ${centered ? "mx-auto text-center" : ""}`}>
            {eyebrow ? (
              <p className="mb-3 inline-flex rounded-full border border-line bg-surface/60 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent-text">
                {eyebrow}
              </p>
            ) : null}
            <h2 className="text-3xl font-semibold leading-tight tracking-tight text-fg sm:text-[2.6rem]">
              {title}
            </h2>
            {intro ? (
              <p className="mt-4 text-base leading-relaxed text-muted">{intro}</p>
            ) : null}
          </Reveal>
        ) : null}

        {children}
      </div>
    </section>
  );
}

/** The banner that closes a page: one decision, stated once, on the brand. */
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
    <section className="relative overflow-hidden">
      <div className="mx-auto max-w-6xl px-5 py-24">
        <Reveal>
          <div className="brand-gradient relative isolate overflow-hidden rounded-3xl px-8 py-16 text-center sm:px-16">
            {/* The art is decorative and half off the edge on purpose — a
                contained illustration would turn this into a card. */}
            <ArcArt className="pointer-events-none absolute -right-16 -top-24 h-[26rem] w-[26rem] opacity-40" />
            <div aria-hidden className="grain opacity-[0.08]" />

            <h2 className="relative text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {title}
            </h2>
            <p className="relative mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/85">
              {body}
            </p>
            <div className="relative mt-9 flex flex-wrap justify-center gap-3">{children}</div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/** The button treatment that survives being placed on the brand gradient. */
export function CtaButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-[var(--brand-navy)] shadow-lg transition-transform duration-200 hover:-translate-y-0.5"
    >
      {children}
    </a>
  );
}

export function CtaGhost({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="rounded-xl border border-white/40 px-6 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-white/10"
    >
      {children}
    </a>
  );
}
