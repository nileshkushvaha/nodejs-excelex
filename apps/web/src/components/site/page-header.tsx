/**
 * The banner every page except the home page opens with.
 *
 * Shorter than the hero on purpose — an inner page has already been chosen, so
 * its job is to confirm where you are, not to sell the choice again. The top
 * padding clears the fixed header.
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
      <div aria-hidden className="brand-gradient absolute inset-0 -z-10 opacity-[0.07]" />

      <div className="animate-fade-up mx-auto max-w-6xl px-5 pb-16 pt-32 sm:pt-36">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent-text">
          {eyebrow}
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight text-fg sm:text-5xl">
          {title}
        </h1>
        {intro ? (
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">{intro}</p>
        ) : null}
      </div>
    </section>
  );
}
