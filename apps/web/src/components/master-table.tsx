import type { ReactNode } from "react";

/**
 * The table, and only the table.
 *
 * It used to own a search box and a row count. Both moved to the filter bar
 * above it, so a list has one place that decides which rows are shown rather
 * than two that have to agree.
 */
export function MasterTable<T>({
  rows,
  columns,
  empty,
  rowKey,
  stickyLastColumn = true,
}: {
  rows: readonly T[];
  columns: ReadonlyArray<{ header: string; cell: (row: T) => ReactNode; className?: string }>;
  empty: string;
  rowKey: (row: T) => string;
  /**
   * Pins the last column to the right edge while the rest scrolls.
   *
   * On by default because every list here ends with Edit and Delete, and a
   * wide table scrolls them out of view — the most-used column being the
   * first to disappear. Caught in the browser: a seven-column fuel surcharge
   * table was 763px inside a 641px card, and the actions were simply gone.
   *
   * Off for a table whose last column is data rather than controls.
   */
  stickyLastColumn?: boolean;
}) {
  const lastIndex = columns.length - 1;

  // The pinned cell needs its own background, or the scrolling content shows
  // through it. It matches the row underneath, hover included.
  const pinned = (index: number, tone: "head" | "body") =>
    stickyLastColumn && index === lastIndex
      ? tone === "head"
        ? "sticky right-0 z-10 bg-surface-3 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.25)]"
        : "sticky right-0 z-10 bg-surface shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.25)] group-hover:bg-surface-2"
      : "";

  return (
    <div>
      <div className="overflow-hidden card rounded-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="brand-gradient-soft border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                {columns.map((column, index) => (
                  <th
                    key={column.header}
                    className={`px-4 py-2.5 font-medium ${column.className ?? ""} ${pinned(index, "head")}`}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-muted">
                    {empty}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={rowKey(row)} className="group row-hover hover:bg-surface-2">
                    {columns.map((column, index) => (
                      <td
                        key={column.header}
                        className={`px-4 py-2.5 ${column.className ?? ""} ${pinned(index, "body")}`}
                      >
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
