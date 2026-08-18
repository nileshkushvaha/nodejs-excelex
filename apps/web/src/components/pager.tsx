"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * Paging for the server-paged masters.
 *
 * The page lives in the URL like the filters do, so a page is a link and the
 * back button walks back through the pages somebody actually visited.
 */
export function Pager({
  page,
  pageCount,
  total,
  pageSize,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  if (pageCount <= 1) return null;

  function goTo(target: number) {
    const query = new URLSearchParams(params.toString());
    query.set("page", String(target));
    startTransition(() => router.replace(`${pathname}?${query.toString()}`));
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav className="mt-4 flex flex-wrap items-center justify-between gap-3" aria-label="Pagination">
      <p className="text-xs text-muted">
        Showing {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </p>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => goTo(page - 1)}
          disabled={page <= 1}
          className="btn-secondary rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40"
        >
          Previous
        </button>
        <span className="px-2 text-xs tabular-nums text-muted">
          Page {page} of {pageCount}
        </span>
        <button
          type="button"
          onClick={() => goTo(page + 1)}
          disabled={page >= pageCount}
          className="btn-secondary rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
