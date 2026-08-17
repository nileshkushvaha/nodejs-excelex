import Link from "next/link";

import { PageHeader } from "@/components/site/page-header";
import { Reveal } from "@/components/site/reveal";
import { CallToAction, Section } from "@/components/site/section";
import { REASONS } from "@/content/site";

export const metadata = {
  title: "About · ExcelEx",
  description: "Who ExcelEx is and how the network is run.",
};

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="About"
        title="A courier company that runs on its own software."
        intro="ExcelEx moves consignments across India and beyond. The system behind it — booking, manifests, scanning, tracking and billing — is built and run in house, which is why the tracking page and the operations floor never disagree."
      />

      <Section
        eyebrow="How we work"
        title="What we hold ourselves to."
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
        title="Work with us."
        body="Regular accounts, franchise enquiries and partnerships all start the same way — a conversation."
      >
        <Link
          href="/contact"
          className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-[var(--brand-navy)] transition-transform hover:-translate-y-0.5"
        >
          Get in touch
        </Link>
      </CallToAction>
    </>
  );
}
