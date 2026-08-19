import Link from "next/link";

import { ServiceIcon } from "@/components/site/artwork";
import { CmsPageView, firstParam, isRedirect } from "@/components/site/cms-page";
import { Hero } from "@/components/site/hero";
import { Reveal } from "@/components/site/reveal";
import { CallToAction, CtaButton, CtaGhost, Section } from "@/components/site/section";
import { Stats } from "@/components/site/stats";
import { REASONS, SERVICES, STEPS } from "@/content/site";
import { getPublicPage, getPublicSite } from "@/lib/api";

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

/**
 * The front page. If the site settings name a home page, that CMS page is
 * rendered here — at "/", not at its own path — and the static banner and
 * sections below are what every client sees until an editor picks one. The
 * static home is also the answer whenever the CMS is silent: no settings, no
 * such page, API down.
 */
export default async function HomePage(props: Props) {
  const [site, query] = await Promise.all([getPublicSite(), props.searchParams]);
  if (site?.homePage?.slug) {
    const page = await getPublicPage(site.homePage.slug, firstParam(query.preview));
    if (page && !isRedirect(page)) return <CmsPageView page={page} preview={Boolean(query.preview)} />;
  }

  return (
    <>
      <Hero />

      <Section tone="lit">
        <Stats />
      </Section>

      <Section
        eyebrow="What we move"
        title="Four services. One network underneath them."
        intro="Every consignment runs on the same scans, the same tracking and the same billing, whichever of these it was booked as."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          {SERVICES.map((service, index) => (
            <Reveal key={service.id} delay={index * 90}>
              <Link
                href={`/services#${service.id}`}
                className="glass glass-lift group flex h-full flex-col rounded-2xl p-7"
              >
                <span className="icon-tile grid h-12 w-12 place-items-center rounded-xl text-white">
                  <ServiceIcon name={service.id as "domestic"} className="h-6 w-6" />
                </span>

                <h3 className="mt-5 text-xl font-semibold text-fg">{service.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{service.summary}</p>

                <ul className="mt-5 space-y-2">
                  {service.points.map((point) => (
                    <li key={point} className="flex gap-2.5 text-sm text-muted">
                      <Tick />
                      {point}
                    </li>
                  ))}
                </ul>

                <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-medium text-accent-text">
                  Read more
                  <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-1">
                    →
                  </span>
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section
        tone="lit"
        eyebrow="How it works"
        title="Book it, and know where it is."
        intro="Four steps, and a record of every one of them."
        centered
      >
        <ol className="relative grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* The rule the steps sit on. Behind them, only on the widths where
              they are actually in a row. */}
          <span
            aria-hidden
            className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-[var(--brand-cyan)] to-transparent opacity-40 lg:block"
          />
          {STEPS.map((step, index) => (
            <Reveal key={step.title} delay={index * 90}>
              <li className="relative">
                <span className="icon-tile relative grid h-12 w-12 place-items-center rounded-xl text-sm font-semibold text-white">
                  {index + 1}
                </span>
                <h3 className="mt-5 font-semibold text-fg">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.body}</p>
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
        <div className="grid gap-6 sm:grid-cols-2">
          {REASONS.map((reason, index) => (
            <Reveal key={reason.title} delay={index * 90}>
              <div className="glass glass-lift h-full rounded-2xl p-7">
                <h3 className="text-xl font-semibold text-fg">{reason.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted">{reason.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <CallToAction
        title="Have something to send?"
        body="Track a shipment you have already booked, or talk to us about a regular account."
      >
        <CtaButton href="/track">Track a shipment</CtaButton>
        <CtaGhost href="/contact">Talk to us</CtaGhost>
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
      className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-mint)]"
    >
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.79 6.8-6.79a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
