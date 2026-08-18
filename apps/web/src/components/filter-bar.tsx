"use client";

import { useMemo, useState, type ReactNode } from "react";

import { filterControl, SearchableSelect } from "./searchable-select";

export type FilterDefinition<T> =
  | {
      kind: "text";
      key: string;
      label: string;
      placeholder?: string;
      /**
       * The text this filter matches against, per row. Omitted when the bar
       * drives a server query instead — a paged master filters in SQL, and
       * there is no full row list here to match against.
       */
      match?: (row: T) => string;
      /** Text filters take the most room, so they can span columns. */
      span?: 2 | 3;
    }
  | {
      kind: "select";
      key: string;
      label: string;
      options: ReadonlyArray<{ value: string; label: string }>;
      /** Omitted when the bar drives a server query. */
      match?: (row: T, value: string) => boolean;
      /** Preselected value. A filter that starts set must say so. */
      initial?: string;
      /** Omit to render an "All" entry; give a label to name it. */
      allLabel?: string | null;
      /**
       * Force the type-to-search control on or off. Left out, it turns itself
       * on once the list passes SEARCHABLE_ABOVE — which is the right rule,
       * because how long these lists get is a property of the data, not of
       * the screen that renders them.
       */
      searchable?: boolean;
    };

/**
 * A filter bar above the table, rather than filter boxes inside it.
 *
 * The legacy grid put an input under every heading because that is what its
 * table plugin offered. Most of those columns are never filtered, so the row
 * costs a permanent strip of empty inputs across the screen to make three of
 * them reachable. A bar names the few fields people actually use and leaves the
 * table to be a table.
 *
 * Everything runs against rows already in the browser, so a filter takes effect
 * as it is typed with no request and no reload. That is only honest while a
 * master fits in one response; past that the work has to move to the database,
 * and this component is the wrong tool.
 */
export function useFilterBar<T>(rows: readonly T[], definitions: ReadonlyArray<FilterDefinition<T>>) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const definition of definitions) {
      initial[definition.key] =
        definition.kind === "select" ? (definition.initial ?? "") : "";
    }
    return initial;
  });

  const filtered = useMemo(() => {
    return rows.filter((row) =>
      definitions.every((definition) => {
        const value = values[definition.key] ?? "";
        if (!value.trim()) return true;

        // No match function means this filter is answered by the server.
        if (!definition.match) return true;

        return definition.kind === "text"
          ? definition.match(row).toLowerCase().includes(value.trim().toLowerCase())
          : definition.match(row, value);
      }),
    );
  }, [rows, definitions, values]);

  // "Active" means a filter is narrowing the list — a select left on its
  // initial value is not, or Clear would appear on a screen nobody has touched.
  const active = definitions.some((definition) => {
    const value = values[definition.key] ?? "";
    const initial = definition.kind === "select" ? (definition.initial ?? "") : "";
    return value !== initial;
  });

  function reset() {
    const cleared: Record<string, string> = {};
    for (const definition of definitions) {
      cleared[definition.key] = definition.kind === "select" ? (definition.initial ?? "") : "";
    }
    setValues(cleared);
  }

  return { values, setValues, filtered, active, reset };
}

/**
 * Past this many options a native select stops being usable: it only jumps by
 * first letter, so finding "West Bengal" among thirty-six states means
 * scrolling. Below it, a native select is still the better control — it is
 * lighter, and the whole list is already on screen.
 */
const SEARCHABLE_ABOVE = 10;

export function FilterBar<T>({
  definitions,
  values,
  onChange,
  active,
  onReset,
  total,
  shown,
  noun,
  actions,
  before,
}: {
  definitions: ReadonlyArray<FilterDefinition<T>>;
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  active: boolean;
  onReset: () => void;
  /** Rows before filtering, and after. The bar reports both. */
  total: number;
  shown: number;
  /** Both forms, because "1 service centres" is a defect people notice. */
  noun: { one: string; many: string };
  actions?: ReactNode;
  /**
   * A control that belongs among the filters but is not one of them — a
   * selector that reloads the list rather than narrowing rows already loaded.
   * It sits first, because it decides what the other filters are filtering.
   */
  before?: ReactNode;
}) {
  const set = (key: string, value: string) => onChange({ ...values, [key]: value });

  return (
    <div className="card mb-4 rounded-xl p-4">
      <div className="flex flex-wrap items-end gap-3">
        {before}
        {definitions.map((definition) => (
          <label
            key={definition.key}
            className={`block ${
              definition.kind === "text" && definition.span === 3
                ? "min-w-72 flex-[3]"
                : definition.kind === "text"
                  ? "min-w-56 flex-[2]"
                  : // Capped, or a select that lands alone on a wrapped row
                    // stretches the full width of the bar.
                    "min-w-40 max-w-56 flex-1"
            }`}
          >
            <span className="mb-1 block text-xs font-medium text-muted">{definition.label}</span>

            {definition.kind === "text" ? (
              <input
                type="search"
                value={values[definition.key] ?? ""}
                onChange={(event) => set(definition.key, event.target.value)}
                placeholder={definition.placeholder}
                className={filterControl}
              />
            ) : (definition.searchable ?? definition.options.length > SEARCHABLE_ABOVE) ? (
              <SearchableSelect
                value={values[definition.key] ?? ""}
                options={definition.options}
                allLabel={definition.allLabel}
                onChange={(next) => set(definition.key, next)}
              />
            ) : (
              <select
                value={values[definition.key] ?? ""}
                onChange={(event) => set(definition.key, event.target.value)}
                className={filterControl}
              >
                {definition.allLabel !== null ? (
                  <option value="">{definition.allLabel ?? "All"}</option>
                ) : null}
                {definition.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </label>
        ))}

        {active ? (
          <button
            type="button"
            onClick={onReset}
            className="btn-secondary rounded-lg px-3 py-2 text-sm font-medium"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-3">
        <p className="text-xs text-muted">
          {shown === total
            ? `${total.toLocaleString()} ${total === 1 ? noun.one : noun.many}`
            : `${shown.toLocaleString()} of ${total.toLocaleString()} ${total === 1 ? noun.one : noun.many}`}
        </p>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export { filterControl, SearchableSelect } from "./searchable-select";
