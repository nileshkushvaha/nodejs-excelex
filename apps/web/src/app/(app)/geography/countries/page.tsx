import { getCountries } from "@/lib/api";
import { CountriesTable } from "./countries-table";

export const metadata = { title: "Countries · ExcelEx" };

export default async function CountriesPage() {
  const countries = await getCountries();

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-fg">Countries</h1>
        <p className="mt-0.5 text-sm text-muted">
          ISO 3166-1, shared by every account and read-only. Names come from CLDR, so they track
          official renames without anyone editing a row.
        </p>
      </header>

      {countries ? (
        <CountriesTable countries={countries} />
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
          Countries could not be loaded.
        </p>
      )}
    </div>
  );
}
