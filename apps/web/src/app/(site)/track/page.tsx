import { PageHeader } from "@/components/site/page-header";
import { Reveal } from "@/components/site/reveal";
import { Section } from "@/components/site/section";

export const metadata = {
  title: "Track a shipment · ExcelEx",
  description: "Enter an AWB number to see where your consignment is.",
};

export default function TrackPage() {
  return (
    <>
      <PageHeader
        eyebrow="Tracking"
        title="Where is my shipment?"
        intro="Enter the AWB number from your receipt. Tracking needs no account."
      />

      <Section tone="lit">
        <div className="mx-auto max-w-2xl">
          <Reveal>
            <form className="glass rounded-2xl p-7">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">AWB number</span>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 4200 1234 5678"
                    disabled
                    className="flex-1 rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft"
                  />
                  <button
                    type="submit"
                    disabled
                    className="btn-primary rounded-lg px-6 py-2.5 text-sm font-medium disabled:opacity-60"
                  >
                    Track
                  </button>
                </div>
              </label>

              <p className="mt-4 rounded-lg border border-line bg-surface-2 p-3 text-xs leading-relaxed text-muted">
                Tracking goes live with the shipment module. The page exists now because public
                tracking is one of the few paths that must stay available even when a client is
                over its storage quota — it is not something to bolt on at the end.
              </p>
            </form>
          </Reveal>

          <Reveal delay={100}>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {[
                { title: "Booked", body: "The AWB exists and collection is due." },
                { title: "In transit", body: "Scanned at each hub along the route." },
                { title: "Delivered", body: "Signed for, with proof captured at the door." },
              ].map((stage) => (
                <div key={stage.title} className="glass glass-lift rounded-2xl p-5">
                  <h2 className="text-sm font-semibold text-fg">{stage.title}</h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{stage.body}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </Section>
    </>
  );
}
