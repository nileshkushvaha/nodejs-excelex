import { PageHeader } from "@/components/site/page-header";
import { Reveal } from "@/components/site/reveal";
import { Section } from "@/components/site/section";
import { CONTACT } from "@/content/site";

export const metadata = {
  title: "Contact · ExcelEx",
  description: "Talk to ExcelEx about a shipment, an account or a destination.",
};

const field =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft";

export default function ContactPage() {
  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title="Talk to us."
        intro="A shipment, a regular account, or a destination you are not sure we cover — all of it starts here."
      />

      <Section tone="surface">
        <div className="grid gap-10 lg:grid-cols-5">
          <Reveal className="lg:col-span-3">
            {/* No action yet: this posts nowhere until the enquiry endpoint
                exists, and a form that silently discards what somebody typed is
                worse than one that says it is not ready. */}
            <form className="card rounded-xl p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Your name</span>
                  <input name="name" disabled className={field} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Company</span>
                  <input name="company" disabled className={field} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Email</span>
                  <input name="email" type="email" disabled className={field} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Phone</span>
                  <input name="phone" type="tel" disabled className={field} />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-muted">How can we help?</span>
                  <textarea name="message" rows={5} disabled className={field} />
                </label>
              </div>

              <button
                type="submit"
                disabled
                className="btn-primary mt-5 rounded-lg px-5 py-2.5 text-sm font-medium disabled:opacity-60"
              >
                Send enquiry
              </button>
              <p className="mt-3 text-xs text-muted">
                The enquiry form goes live with the contact module. Until then, the phone number and
                email address beside this reach the same desk.
              </p>
            </form>
          </Reveal>

          <Reveal delay={100} className="lg:col-span-2">
            <div className="card rounded-xl p-6">
              <h2 className="text-lg font-semibold text-fg">Head office</h2>
              <address className="mt-3 not-italic text-sm leading-relaxed text-muted">
                {CONTACT.addressLines.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </address>

              <dl className="mt-5 space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-medium text-muted">Phone</dt>
                  <dd>
                    <a href={`tel:${CONTACT.phone.replace(/\s/g, "")}`} className="text-accent-text">
                      {CONTACT.phone}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted">Email</dt>
                  <dd>
                    <a href={`mailto:${CONTACT.email}`} className="text-accent-text">
                      {CONTACT.email}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted">Hours</dt>
                  <dd className="text-fg">{CONTACT.hours}</dd>
                </div>
              </dl>
            </div>
          </Reveal>
        </div>
      </Section>
    </>
  );
}
