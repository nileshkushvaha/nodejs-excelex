/**
 * The shape of a screen, shown while its data is still arriving.
 *
 * Perceived performance is most of performance: a page that shows its heading
 * and the outline of a table in 100ms feels faster than one that shows nothing
 * for 400ms, even when the second finishes sooner. Every list screen blocked
 * on every one of its API calls before rendering anything at all.
 *
 * The skeleton mirrors the real layout rather than being a generic spinner, so
 * nothing moves when the content replaces it.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-surface-3 ${className}`} aria-hidden />;
}

/** A filter bar and a table, which is what nearly every master screen is. */
export function ListSkeleton({ columns = 6, rows = 8 }: { columns?: number; rows?: number }) {
  return (
    // Announced politely rather than not at all: a screen reader should know
    // the page is loading, and should not be interrupted when it finishes.
    <div role="status" aria-live="polite" aria-label="Loading">
      <span className="sr-only">Loading…</span>

      <div className="card mb-4 rounded-xl p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Skeleton className="h-10 min-w-72 flex-[3]" />
          <Skeleton className="h-10 min-w-40 max-w-56 flex-1" />
          <Skeleton className="h-10 min-w-40 max-w-56 flex-1" />
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-line-soft pt-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>

      <div className="card overflow-hidden rounded-xl">
        <div className="brand-gradient-soft flex gap-4 border-b border-line px-4 py-3">
          {Array.from({ length: columns }, (_, index) => (
            <Skeleton key={index} className="h-3 flex-1" />
          ))}
        </div>

        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex gap-4 border-b border-line-soft px-4 py-3.5 last:border-0">
            {Array.from({ length: columns }, (_, column) => (
              <Skeleton
                key={column}
                // Varied widths, so it reads as rows of content rather than
                // as a grid of identical bars.
                className={`h-3 ${column === 1 ? "flex-[1.6]" : "flex-1"} ${
                  row % 3 === 2 ? "opacity-70" : ""
                }`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A form, for the add and edit routes. */
export function FormSkeleton({ fields = 8 }: { fields?: number }) {
  return (
    <div role="status" aria-live="polite" aria-label="Loading">
      <span className="sr-only">Loading…</span>

      <div className="card rounded-xl p-5">
        <div className="grid gap-4 sm:grid-cols-4">
          {Array.from({ length: fields }, (_, index) => (
            <div key={index} className={index % 5 === 1 ? "sm:col-span-2" : ""}>
              <Skeleton className="mb-1.5 h-3 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The page heading, which is known before any data arrives. */
export function PageHeadingSkeleton() {
  return (
    <header className="mb-5">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="mt-2 h-3 w-96 max-w-full" />
    </header>
  );
}
