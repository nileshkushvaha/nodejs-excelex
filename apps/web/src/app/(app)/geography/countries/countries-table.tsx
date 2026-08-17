"use client";

import { FilterBar, useFilterBar, type FilterDefinition } from "@/components/filter-bar";
import { MasterTable } from "@/components/master-table";
import type { Country } from "@/lib/api";

// Countries are read, not maintained, so one search box is the whole bar.
const DEFINITIONS: ReadonlyArray<FilterDefinition<Country>> = [
  {
    kind: "text",
    key: "search",
    label: "Search",
    placeholder: "Name, ISO code, dial code or currency…",
    span: 3,
    match: (country) =>
      `${country.name} ${country.code} ${country.alpha3} ${country.dialCode ?? ""} ${country.currency ?? ""} ${country.region ?? ""}`,
  },
];

export function CountriesTable({ countries }: { countries: Country[] }) {
  const { values, setValues, filtered, active, reset } = useFilterBar(countries, DEFINITIONS);

  return (
    <>
      <FilterBar
        definitions={DEFINITIONS}
        values={values}
        onChange={setValues}
        active={active}
        onReset={reset}
        total={countries.length}
        shown={filtered.length}
        noun={{ one: "country", many: "countries" }}
      />

      <MasterTable
        rows={filtered}
        rowKey={(country) => country.code}
        empty="No countries match this search."
        columns={[
          {
            header: "Country",
            cell: (country) => <span className="font-medium text-fg">{country.name}</span>,
          },
          {
            header: "Code",
            cell: (country) => (
              <span className="font-mono text-xs text-muted">
                {country.code} · {country.alpha3}
              </span>
            ),
          },
          {
            header: "Dial",
            cell: (country) => (
              <span className="font-mono text-xs tabular-nums text-muted">
                {country.dialCode ? `+${country.dialCode}` : "—"}
              </span>
            ),
          },
          {
            header: "Currency",
            cell: (country) => (
              <span className="font-mono text-xs text-muted">{country.currency ?? "—"}</span>
            ),
          },
          {
            header: "Region",
            cell: (country) => <span className="text-xs text-muted">{country.region ?? "—"}</span>,
          },
        ]}
      />
    </>
  );
}
