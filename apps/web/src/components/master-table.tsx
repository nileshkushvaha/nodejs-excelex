"use client";

import { useMemo, useState, type ReactNode } from "react";

/**
 * A filterable table for reference and master data.
 *
 * Filtering happens in the browser because these lists are bounded and already
 * loaded — 249 countries is the largest, and a round trip per keystroke to
 * filter data the page is holding would be slower and less reliable than a
 * string match. The moment a master is unbounded (customers, shipments) this
 * stops being the right answer and the filter moves to the query.
 */
export function MasterTable<T>({
  rows,
  columns,
  searchable,
  placeholder,
  empty,
  actions,
  rowKey,
}: {
  rows: readonly T[];
  columns: ReadonlyArray<{ header: string; cell: (row: T) => ReactNode; className?: string }>;
  /** The values a filter matches against. */
  searchable: (row: T) => string;
  placeholder: string;
  empty: string;
  actions?: ReactNode;
  rowKey: (row: T) => string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => searchable(row).toLowerCase().includes(needle));
  }, [rows, query, searchable]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
          >
            <path d="M10 2a8 8 0 105.3 14l4.4 4.3 1.4-1.4-4.3-4.3A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="w-full rounded-lg border border-line-strong bg-surface py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft"
          />
        </div>

        <span className="text-xs tabular-nums text-muted">
          {filtered.length === rows.length
            ? `${rows.length} ${rows.length === 1 ? "row" : "rows"}`
            : `${filtered.length} of ${rows.length}`}
        </span>

        {actions}
      </div>

      <div className="overflow-hidden card rounded-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="brand-gradient-soft border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                {columns.map((column) => (
                  <th key={column.header} className={`px-4 py-2.5 font-medium ${column.className ?? ""}`}>
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-muted">
                    {query ? `Nothing matches “${query}”.` : empty}
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={rowKey(row)} className="row-hover hover:bg-surface-2">
                    {columns.map((column) => (
                      <td key={column.header} className={`px-4 py-2.5 ${column.className ?? ""}`}>
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
      active
    </span>
  ) : (
    <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted">
      inactive
    </span>
  );
}
