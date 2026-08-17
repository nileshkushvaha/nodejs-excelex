"use client";

import { useRouter, useSearchParams } from "next/navigation";

import {
  FilterBar,
  SearchableSelect,
  useFilterBar,
  type FilterDefinition,
} from "@/components/filter-bar";
import { MasterTable } from "@/components/master-table";
import type { Country, StateRow } from "@/lib/api";

const DEFINITIONS: ReadonlyArray<FilterDefinition<StateRow>> = [
  {
    kind: "text",
    key: "search",
    label: "Search",
    placeholder: "Name, code or GST code…",
    span: 3,
    match: (state) => `${state.name} ${state.code} ${state.gstCode ?? ""}`,
  },
  {
    kind: "select",
    key: "type",
    label: "Type",
    options: [
      { value: "STATE", label: "State" },
      { value: "UNION_TERRITORY", label: "Union territory" },
    ],
    match: (state, value) => state.type === value,
  },
];

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
  const { values, setValues, filtered, active, reset } = useFilterBar(states, DEFINITIONS);

  function chooseCountry(code: string) {
    const next = new URLSearchParams(params.toString());
    next.set("country", code);
    // The country lives in the URL so a particular list can be linked and
    // bookmarked, and so the back button behaves the way the address bar says
    // it will. That is why it is a `before` control and not a filter: it
    // changes which rows are loaded, not which of them are shown.
    router.push(`/geography/states?${next.toString()}`);
  }

  return (
    <>
      <FilterBar
        definitions={DEFINITIONS}
        values={values}
        onChange={setValues}
        active={active}
        onReset={reset}
        total={states.length}
        shown={filtered.length}
        noun={{ one: "subdivision", many: "subdivisions" }}
        before={
          <label className="block min-w-40 max-w-56 flex-1">
            <span className="mb-1 block text-xs font-medium text-muted">Country</span>
            <SearchableSelect
              value={selected}
              options={countries.map((country) => ({ value: country.code, label: country.name }))}
              // Every subdivision belongs to some country, so there is no
              // "All" to fall back to — one is always chosen.
              allLabel={null}
              onChange={chooseCountry}
            />
          </label>
        }
      />

      <MasterTable
        rows={filtered}
        rowKey={(state) => state.code}
        empty="No subdivisions match these filters."
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
    </>
  );
}
