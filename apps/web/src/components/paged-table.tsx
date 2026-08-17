"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

export interface PagedColumn<T> {
  header: string;
  /** Query parameter this column sorts by. Omit to make the column unsortable. */
  sortKey?: string;
  /** Query parameter this column filters on. Omit for no filter box. */
  filterKey?: string;
  filterPlaceholder?: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

/**
 * A table whose paging, sorting and filtering live in the URL.
 *
 * The URL is the state, not component state. That makes a filtered view
 * linkable, survivable across a refresh, and correct under the back button —
 * and it means the server component above can do the querying, so the browser
 * never holds a master it did not ask for.
 *
 * Filters are debounced. Each keystroke is a database query, and firing one per
 * character turns a four-thousand-row master into a denial of service against
 * your own API.
 */
export function PagedTable<T>({
  rows,
  columns,
  rowKey,
  total,
  page,
  pageSize,
  pageCount,
  basePath,
  toolbar,
  empty,
}: {
  rows: readonly T[];
  columns: ReadonlyArray<PagedColumn<T>>;
  rowKey: (row: T) => string;
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  basePath: string;
  toolbar?: ReactNode;
  empty: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const sort = params.get("sort") ?? "";
  const direction = params.get("direction") === "desc" ? "desc" : "asc";

  // Filter inputs are held locally and pushed after a pause, so typing stays
  // responsive while the URL — and the query — lags behind deliberately.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const column of columns) {
      if (column.filterKey) initial[column.filterKey] = params.get(column.filterKey) ?? "";
    }
    setDraft(initial);
    // Re-seeded from the URL whenever it changes, so the back button restores
    // the boxes as well as the results.
  }, [params, columns]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function push(next: URLSearchParams) {
    router.push(`${basePath}?${next.toString()}`);
  }

  function applyFilter(key: string, value: string) {
    setDraft((previous) => ({ ...previous, [key]: value }));

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value.trim()) next.set(key, value.trim());
      else next.delete(key);
      // Any filter change invalidates the current page number: page 7 of the
      // old result set is meaningless against the new one.
      next.delete("page");
      push(next);
    }, 350);
  }

  function toggleSort(key: string) {
    const next = new URLSearchParams(params.toString());
    next.set("sort", key);
    next.set("direction", sort === key && direction === "asc" ? "desc" : "asc");
    next.delete("page");
    push(next);
  }

  function goToPage(target: number) {
    const next = new URLSearchParams(params.toString());
    next.set("page", String(target));
    push(next);
  }

  function setPageSize(size: number) {
    const next = new URLSearchParams(params.toString());
    next.set("pageSize", String(size));
    next.delete("page");
    push(next);
  }

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="space-y-3">
      {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}

      <div className="card card-interactive overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="brand-gradient-soft border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                {columns.map((column) => (
                  <th key={column.header} className={`px-4 py-2.5 font-semibold ${column.className ?? ""}`}>
                    {column.sortKey ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.sortKey!)}
                        className="inline-flex items-center gap-1 transition-colors hover:text-fg"
                        aria-label={`Sort by ${column.header}`}
                      >
                        {column.header}
                        <span aria-hidden="true" className="text-[10px] opacity-70">
                          {sort === column.sortKey ? (direction === "asc" ? "▲" : "▼") : "⇅"}
                        </span>
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                ))}
              </tr>

              {columns.some((column) => column.filterKey) ? (
                <tr className="border-b border-line bg-surface-2">
                  {columns.map((column) => (
                    <th key={column.header} className="px-2 py-1.5">
                      {column.filterKey ? (
                        <input
                          value={draft[column.filterKey] ?? ""}
                          onChange={(event) => applyFilter(column.filterKey!, event.target.value)}
                          placeholder={column.filterPlaceholder ?? column.header}
                          aria-label={`Filter by ${column.header}`}
                          className="w-full rounded border border-line-strong bg-surface px-2 py-1 text-xs font-normal normal-case outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft"
                        />
                      ) : null}
                    </th>
                  ))}
                </tr>
              ) : null}
            </thead>

            <tbody className="divide-y divide-line-soft">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-muted">
                    {empty}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
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

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5">
          <p className="text-xs text-muted">
            {total === 0 ? "No entries" : `Showing ${from} to ${to} of ${total.toLocaleString()} entries`}
          </p>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-muted">
              Rows
              <select
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
                className="rounded border border-line-strong bg-surface px-1.5 py-1 text-xs outline-none focus:border-accent"
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>

            <Pager page={page} pageCount={pageCount} onGo={goToPage} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Pager({
  page,
  pageCount,
  onGo,
}: {
  page: number;
  pageCount: number;
  onGo: (page: number) => void;
}) {
  // A window around the current page plus the first and last. With 172 pages,
  // rendering every number is unusable and rendering only arrows makes the end
  // of the master unreachable without clicking 171 times.
  const windowed = new Set<number>([1, pageCount, page - 1, page, page + 1]);
  const pages = [...windowed].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);

  const button =
    "grid h-7 min-w-7 place-items-center rounded px-1.5 text-xs transition-colors disabled:opacity-40";

  return (
    <nav aria-label="Pagination" className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onGo(1)}
        disabled={page === 1}
        aria-label="First page"
        className={`${button} border border-line-strong hover:bg-surface-2`}
      >
        ««
      </button>
      <button
        type="button"
        onClick={() => onGo(page - 1)}
        disabled={page === 1}
        aria-label="Previous page"
        className={`${button} border border-line-strong hover:bg-surface-2`}
      >
        ‹
      </button>

      {pages.map((number, index) => (
        <span key={number} className="flex items-center gap-1">
          {index > 0 && number - pages[index - 1]! > 1 ? (
            <span className="px-0.5 text-xs text-faint">…</span>
          ) : null}
          <button
            type="button"
            onClick={() => onGo(number)}
            aria-current={number === page ? "page" : undefined}
            className={`${button} ${
              number === page
                ? "brand-gradient font-semibold text-white"
                : "border border-line-strong hover:bg-surface-2"
            }`}
          >
            {number}
          </button>
        </span>
      ))}

      <button
        type="button"
        onClick={() => onGo(page + 1)}
        disabled={page === pageCount}
        aria-label="Next page"
        className={`${button} border border-line-strong hover:bg-surface-2`}
      >
        ›
      </button>
      <button
        type="button"
        onClick={() => onGo(pageCount)}
        disabled={page === pageCount}
        aria-label="Last page"
        className={`${button} border border-line-strong hover:bg-surface-2`}
      >
        »»
      </button>
    </nav>
  );
}
