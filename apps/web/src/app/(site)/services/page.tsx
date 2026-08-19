import { ServiceIcon } from "@/components/site/artwork";
import { firstParam, renderCmsPageOrNull } from "@/components/site/cms-page";
import { PageHeader } from "@/components/site/page-header";
import { Reveal } from "@/components/site/reveal";
import { CallToAction, CtaButton, Section } from "@/components/site/section";
import { SERVICES } from "@/content/site";

export const metadata = {
  title: "Services · ExcelEx",
  description: "Domestic express, international, surface cargo and e-commerce logistics.",
};

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

export default async function ServicesPage(props: Props) {
  // A CMS page published at this path wins over the static copy below; the
  // static copy is what visitors see until an editor writes one (or when the
  // CMS cannot be reached).
  const query = await props.searchParams;
  const cms = await renderCmsPageOrNull("/services", firstParam(query.preview));
  if (cms) return cms;

  return (
    <>
      <PageHeader
        eyebrow="Services"
        title="What we move, and how."
        intro="Four services on one network. The scans, the tracking and the billing are the same whichever you book."
      />

      {SERVICES.map((service, index) => (
        <Section key={service.id} id={service.id} tone={index % 2 === 0 ? "lit" : "canvas"}>
          {/* Alternating sides, so a page of four blocks does not read as a
              list of four identical ones. */}
          <div className={`grid items-center gap-12 lg:grid-cols-2 ${index % 2 ? "lg:[&>*:first-child]:order-2" : ""}`}>
            <Reveal>
              <span className="icon-tile grid h-14 w-14 place-items-center rounded-2xl text-white">
                <ServiceIcon name={service.id as "domestic"} className="h-7 w-7" />
              </span>
              <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-accent-text">
                {`Service 0${index + 1}`}
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
                {service.name}
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted">{service.summary}</p>
            </Reveal>

            <Reveal delay={120}>
              <ul className="glass divide-y divide-line-soft rounded-2xl">
                {service.points.map((point) => (
                  <li key={point} className="flex items-center gap-3 px-6 py-5 text-sm text-fg">
                    <span className="brand-gradient h-1.5 w-1.5 shrink-0 rounded-full" />
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
        <CtaButton href="/contact">Contact us</CtaButton>
      </CallToAction>
    </>
  );
}
