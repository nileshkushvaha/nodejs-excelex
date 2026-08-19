
import { firstParam, renderCmsPageOrNull } from "@/components/site/cms-page";
import { PageHeader } from "@/components/site/page-header";
import { Reveal } from "@/components/site/reveal";
import { CallToAction, CtaButton, Section } from "@/components/site/section";
import { REASONS } from "@/content/site";

export const metadata = {
  title: "About · ExcelEx",
  description: "Who ExcelEx is and how the network is run.",
};

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

export default async function AboutPage(props: Props) {
  // A CMS page published at this path wins over the static copy below; the
  // static copy is what visitors see until an editor writes one (or when the
  // CMS cannot be reached).
  const query = await props.searchParams;
  const cms = await renderCmsPageOrNull("/about", firstParam(query.preview));
  if (cms) return cms;

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
              <div className="glass glass-lift h-full rounded-2xl p-7">
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
        <CtaButton href="/contact">Get in touch</CtaButton>
      </CallToAction>
    </>
  );
}
