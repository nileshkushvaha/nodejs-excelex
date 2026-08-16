"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { MasterTable } from "@/components/master-table";
import type { Country, StateRow } from "@/lib/api";

export function StatesTable({
  states,
  countries,
  selected,
}: {
  states: StateRow[];
  countries: Country[];
  selected: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function chooseCountry(code: string) {
    const next = new URLSearchParams(params.toString());
    next.set("country", code);
    // The country lives in the URL so a particular list can be linked and
    // bookmarked, and so the back button behaves the way the address bar says
    // it will.
    router.push(`/geography/states?${next.toString()}`);
  }

  return (
    <MasterTable
      rows={states}
      rowKey={(state) => state.code}
      searchable={(state) => `${state.name} ${state.code} ${state.gstCode ?? ""} ${state.type}`}
      placeholder="Search by name, code or GST code…"
      empty="No subdivisions are recorded for this country yet."
      actions={
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Country</span>
          <select
            value={selected}
            onChange={(event) => chooseCountry(event.target.value)}
            className="rounded-lg border border-line-strong bg-surface px-2.5 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
          >
            {countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
        </label>
      }
      columns={[
        {
          header: "Name",
          cell: (state) => <span className="font-medium text-fg">{state.name}</span>,
        },
        {
          header: "Code",
          cell: (state) => <span className="font-mono text-xs text-muted">{state.code}</span>,
        },
        {
          header: "Type",
          cell: (state) => (
            <span className="text-xs text-muted">
              {state.type === "UNION_TERRITORY" ? "Union territory" : "State"}
            </span>
          ),
        },
        {
          header: "GST code",
          cell: (state) => (
            <span className="font-mono text-xs tabular-nums text-muted">{state.gstCode ?? "—"}</span>
          ),
        },
      ]}
    />
  );
}
