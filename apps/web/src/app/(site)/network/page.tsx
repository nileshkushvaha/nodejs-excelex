
import { PageHeader } from "@/components/site/page-header";
import { Reveal } from "@/components/site/reveal";
import { CallToAction, CtaButton, Section } from "@/components/site/section";
import { Stats } from "@/components/site/stats";

export const metadata = {
  title: "Network · ExcelEx",
  description: "Where ExcelEx delivers, and the service centres behind it.",
};

/**
 * Placeholder coverage until the destination master feeds this page.
 *
 * Deliberately a handful of regions rather than an invented list of cities:
 * the real figures are in the destination master, and this page will read them
 * once the CMS and the public API meet.
 */
const REGIONS = [
  { name: "North", body: "Delhi NCR, Punjab, Haryana, Himachal, Uttarakhand, Uttar Pradesh." },
  { name: "West", body: "Mumbai, Pune, Gujarat, Rajasthan, Goa and the Konkan belt." },
  { name: "South", body: "Bengaluru, Chennai, Hyderabad, Kerala and coastal Andhra." },
  { name: "East", body: "Kolkata, Odisha, Bihar, Jharkhand and the North East." },
];

export default function NetworkPage() {
  return (
    <>
      <PageHeader
        eyebrow="Network"
        title="Where we go."
        intro="A branch behind every pin code we serve, and a scheduled line-haul between the hubs that connect them."
      />

      <Section tone="lit">
        <Stats />
      </Section>

      <Section
        id="coverage"
        eyebrow="Coverage"
        title="Four regions, one line-haul."
        intro="Transit times are committed per destination pair rather than estimated per region — ask us for the pairs you ship most."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          {REGIONS.map((region, index) => (
            <Reveal key={region.name} delay={index * 80}>
              <div className="glass glass-lift h-full rounded-2xl p-7">
                <h3 className="text-lg font-semibold text-fg">{region.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{region.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section
        id="centres"
        tone="lit"
        eyebrow="Service centres"
        title="A named branch, not a queue."
        intro="Each service centre issues its own invoices and carries its own GST registration, so billing questions are answered by the people who raised the invoice."
      >
        <Reveal>
          <div className="glass rounded-2xl p-7 text-sm leading-relaxed text-muted">
            Looking for the branch that covers your pin code? Call us on the number in the footer,
            or send the pin code through the contact form and we will tell you which centre serves
            it and what time it collects.
          </div>
        </Reveal>
      </Section>

      <CallToAction
        title="Shipping somewhere we have not listed?"
        body="The network is larger than this page. Ask about a destination and we will tell you the transit time before you book."
      >
        <CtaButton href="/contact">Ask about a destination</CtaButton>
      </CallToAction>
    </>
  );
}
