import Link from "next/link";

export const metadata = { title: "Track a shipment · ExcelEx" };

export default function TrackPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-20">
      <h1 className="text-2xl font-semibold text-slate-900">Track a shipment</h1>
      <p className="mt-2 text-sm text-slate-600">
        Enter an AWB number to see its journey. Public tracking needs no account.
      </p>

      <form className="mt-6 flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          placeholder="AWB number"
          aria-label="AWB number"
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
        />
        <button
          type="submit"
          disabled
          className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Track
        </button>
      </form>

      <p className="mt-4 rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        Tracking becomes live with the shipment module in Phase 3. The screen exists now because
        public tracking is one of the few paths that must stay available even when a client is over
        its storage quota.
      </p>

      <p className="mt-6 text-xs">
        <Link href="/" className="text-slate-500 underline hover:text-slate-700">
          Back to the public site
        </Link>
      </p>
    </main>
  );
}
