import Link from "next/link";

import { Hero } from "@/components/site/hero";
import { Reveal } from "@/components/site/reveal";
import { CallToAction, Section } from "@/components/site/section";
import { Stats } from "@/components/site/stats";
import { REASONS, SERVICES, STEPS } from "@/content/site";

export default function HomePage() {
  return (
    <>
      <Hero />

      <Section tone="surface">
        <Stats />
      </Section>

      <Section
        eyebrow="What we move"
        title="Four services, one network."
        intro="Every consignment runs on the same scans, the same tracking and the same billing, whichever of these it was booked as."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          {SERVICES.map((service, index) => (
            <Reveal key={service.id} delay={index * 80}>
              <Link
                href={`/services#${service.id}`}
                className="card card-interactive group block h-full rounded-xl p-6"
              >
                <h3 className="text-lg font-semibold text-fg">{service.name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{service.summary}</p>
                <ul className="mt-4 space-y-1.5">
                  {service.points.map((point) => (
                    <li key={point} className="flex gap-2 text-sm text-muted">
                      <Tick />
                      {point}
                    </li>
                  ))}
                </ul>
                <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-accent-text">
                  Read more
                  <span
                    aria-hidden
                    className="transition-transform duration-200 group-hover:translate-x-1"
                  >
                    →
                  </span>
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section
        tone="surface"
        eyebrow="How it works"
        title="Book it, and know where it is."
        intro="Four steps, and a record of every one of them."
      >
        <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <Reveal key={step.title} delay={index * 80}>
              <li className="relative">
                <span className="brand-gradient grid h-10 w-10 place-items-center rounded-full text-sm font-semibold text-white">
                  {index + 1}
                </span>
                <h3 className="mt-4 font-semibold text-fg">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{step.body}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </Section>

      <Section
        eyebrow="Why ExcelEx"
        title="The boring things, done properly."
        intro="Nobody chooses a courier for its website. These are the four things that decide whether you keep one."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          {REASONS.map((reason, index) => (
            <Reveal key={reason.title} delay={index * 80}>
              <div className="card h-full rounded-xl p-6">
                <h3 className="text-lg font-semibold text-fg">{reason.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{reason.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <CallToAction
        title="Have something to send?"
        body="Track a shipment you have already booked, or talk to us about a regular account."
      >
        <Link
          href="/track"
          className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-[var(--brand-navy)] transition-transform hover:-translate-y-0.5"
        >
          Track a shipment
        </Link>
        <Link
          href="/contact"
          className="rounded-lg border border-white/40 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
        >
          Talk to us
        </Link>
      </CallToAction>
    </>
  );
}

function Tick() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      fill="currentColor"
      className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-cyan)]"
    >
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.79 6.8-6.79a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
