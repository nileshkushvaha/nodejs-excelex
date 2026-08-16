import Link from "next/link";

const CAPABILITIES = [
  { title: "Booking & AWB", body: "Shipment entry, AWB inventory and label generation, built for keyboard-first operators." },
  { title: "Manifests & scanning", body: "Hub scan, inbound scan and discrepancy handling with USB barcode scanners in HID mode." },
  { title: "Tracking", body: "An immutable shipment event history with controlled corrections, and public tracking." },
  { title: "Billing", body: "Effective-dated rate cards, surcharges, taxes, invoices, receipts and ageing statements." },
];

export default function HomePage() {
  return (
    <div className="min-h-dvh bg-white text-slate-900">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <span className="flex items-center gap-2 font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded bg-sky-600 text-sm font-bold text-white">
              E
            </span>
            ExcelEx
          </span>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/track" className="text-slate-600 hover:text-slate-900">
              Track a shipment
            </Link>
            <Link
              href="/login"
              className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-6 py-20">
          <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight">
            Courier operations software, built for the companies that run them.
          </h1>
          <p className="mt-4 max-w-xl text-slate-600">
            Booking, manifests, scanning, tracking and billing in one system. Each courier company
            operates in complete isolation from every other — enforced in the database, not only in
            the application.
          </p>
          <div className="mt-8 flex gap-3">
            <Link
              href="/login"
              className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
            >
              Sign in to your account
            </Link>
            <Link
              href="/track"
              className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Track a shipment
            </Link>
          </div>
        </section>

        <section className="border-t border-slate-200 bg-slate-50">
          <div className="mx-auto grid max-w-5xl gap-6 px-6 py-16 sm:grid-cols-2">
            {CAPABILITIES.map((capability) => (
              <div key={capability.title}>
                <h2 className="mb-1 font-semibold">{capability.title}</h2>
                <p className="text-sm leading-relaxed text-slate-600">{capability.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200">
        <div className="mx-auto max-w-5xl px-6 py-6 text-xs text-slate-500">
          © {new Date().getFullYear()} ExcelEx Logistics
        </div>
      </footer>
    </div>
  );
}
