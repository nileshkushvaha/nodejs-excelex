"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Keeps a live screen live without a websocket.
 *
 * `router.refresh()` re-runs the server component and streams the new
 * payload in, so the page's own fetch is the only fetch — there is no second,
 * client-side data path to keep in step with it. The interval is generous
 * (queues and caches change by the second, but nobody reads them by the
 * second) and pausable, because an operator mid-way through reading a table
 * does not want the rows to move under them.
 */
export function AutoRefresh({ intervalMs = 15_000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    setUpdatedAt(new Date());
    if (paused) return;
    const timer = setInterval(() => {
      router.refresh();
      setUpdatedAt(new Date());
    }, intervalMs);
    return () => clearInterval(timer);
  }, [paused, intervalMs, router]);

  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <span
        aria-hidden="true"
        className={`inline-block h-2 w-2 rounded-full ${paused ? "bg-slate-400" : "bg-emerald-500 animate-pulse"}`}
      />
      <span>
        {paused ? "Paused" : "Live"}
        {updatedAt ? ` · updated ${updatedAt.toLocaleTimeString("en-IN", { hour12: false })}` : ""}
      </span>
      <button
        type="button"
        onClick={() => setPaused((value) => !value)}
        className="rounded border border-line px-2 py-0.5 text-xs text-fg hover:bg-surface-3"
      >
        {paused ? "Resume" : "Pause"}
      </button>
    </div>
  );
}
