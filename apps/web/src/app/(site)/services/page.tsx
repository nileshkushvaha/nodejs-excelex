import Link from "next/link";

import { Reveal } from "@/components/site/reveal";
import { CallToAction, Section } from "@/components/site/section";
import { PageHeader } from "@/components/site/page-header";
import { SERVICES } from "@/content/site";

export const metadata = {
  title: "Services · ExcelEx",
  description: "Domestic express, international, surface cargo and e-commerce logistics.",
};

export default function ServicesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Services"
        title="What we move, and how."
        intro="Four services on one network. The scans, the tracking and the billing are the same whichever you book."
      />

      {SERVICES.map((service, index) => (
        <Section key={service.id} id={service.id} tone={index % 2 === 0 ? "surface" : "canvas"}>
          <div className="grid items-start gap-10 lg:grid-cols-2">
            <Reveal>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent-text">
                {`0${index + 1}`}
              </p>
              <h2 className="text-3xl font-semibold tracking-tight text-fg">{service.name}</h2>
              <p className="mt-3 text-base leading-relaxed text-muted">{service.summary}</p>
              <Link
                href="/contact"
                className="btn-primary mt-6 inline-block rounded-lg px-5 py-2.5 text-sm font-medium"
              >
                Ask about {service.name.toLowerCase()}
              </Link>
            </Reveal>

            <Reveal delay={100}>
              <ul className="card divide-y divide-line-soft rounded-xl">
                {service.points.map((point) => (
                  <li key={point} className="px-5 py-4 text-sm text-fg">
                    {point}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </Section>
      ))}

      <CallToAction
        title="Not sure which one you need?"
        body="Tell us what you are sending and where it has to be. We will tell you the cheapest way that still arrives in time."
      >
        <Link
          href="/contact"
          className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-[var(--brand-navy)] transition-transform hover:-translate-y-0.5"
        >
          Contact us
        </Link>
      </CallToAction>
    </>
  );
}
