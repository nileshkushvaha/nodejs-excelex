import { getCountries, getStates } from "@/lib/api";
import { StatesTable } from "./states-table";

export const metadata = { title: "States · ExcelEx" };

export default async function StatesPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string }>;
}) {
  const { country } = await searchParams;
  const selected = (country ?? "IN").toUpperCase();

  const [states, countries] = await Promise.all([getStates(selected), getCountries()]);

  return (
    <div className="mx-auto max-w-5xl animate-fade-up">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">States and territories</h1>
        <p className="mt-0.5 text-sm text-muted">
          Seeded for India. The GST code is the first two digits of every GSTIN issued in that
          state, so an invoice has to agree with it — which is why it is stored rather than derived.
        </p>
      </header>

      {states && countries ? (
        <StatesTable states={states} countries={countries} selected={selected} />
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
          Subdivisions could not be loaded.
        </p>
      )}
    </div>
  );
}
