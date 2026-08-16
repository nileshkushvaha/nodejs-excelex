"use client";

import { MasterTable } from "@/components/master-table";
import type { Country } from "@/lib/api";

export function CountriesTable({ countries }: { countries: Country[] }) {
  return (
    <MasterTable
      rows={countries}
      rowKey={(country) => country.code}
      searchable={(country) =>
        `${country.name} ${country.code} ${country.alpha3} ${country.dialCode ?? ""} ${country.currency ?? ""} ${country.region ?? ""}`
      }
      placeholder="Search by name, code, dial code or currency…"
      empty="No countries."
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
          cell: (country) => <span className="font-mono text-xs text-muted">{country.currency ?? "—"}</span>,
        },
        {
          header: "Region",
          cell: (country) => <span className="text-xs text-muted">{country.region ?? "—"}</span>,
        },
      ]}
    />
  );
}
