import { ArcArt } from "./artwork";

/**
 * The banner every page except the home page opens with.
 *
 * Shorter than the hero on purpose — the page has already been chosen, so its
 * job is to confirm where you are, not to sell the choice again. Same four
 * layers as the hero, at a lower intensity.
 */
export function PageHeader({
  eyebrow,
  title,
  intro,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
}) {
  return (
    <section className="relative isolate overflow-hidden border-b border-line">
      <div aria-hidden className="aurora -z-30 opacity-70" />
      <div aria-hidden className="grid-field -z-20" />
      <div aria-hidden className="grain -z-10" />
      <ArcArt className="pointer-events-none absolute -right-20 -top-32 -z-10 h-[30rem] w-[30rem] opacity-50" />

      <div className="animate-fade-up mx-auto max-w-6xl px-5 pb-20 pt-36 sm:pt-40">
        <p className="glass mb-4 inline-flex rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-accent-text">
          {eyebrow}
        </p>
        <h1 className="headline-gradient max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-[3.25rem]">
          {title}
        </h1>
        {intro ? (
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">{intro}</p>
        ) : null}
      </div>
    </section>
  );
}
