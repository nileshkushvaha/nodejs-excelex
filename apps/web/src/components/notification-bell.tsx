"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The bell.
 *
 * Polls the unread count every minute and fetches the latest few on open —
 * both from the browser through the same-origin /api proxy, so the cookie
 * rides along and nothing is cached across people. Polling rather than a
 * socket: a minute of staleness on a badge costs nothing, and a socket per
 * open tab is infrastructure this screen does not need yet.
 */
export interface NotificationRow {
  id: string;
  kind: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
  emailed: boolean;
}

const POLL_MS = 60_000;

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [rows, setRows] = useState<NotificationRow[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/notifications/recent", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { unread: number; rows: NotificationRow[] };
      setUnread(data.unread);
      setRows(data.rows);
    } catch {
      // A failed poll leaves the last known state; the next one will try again.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    void refresh();
    function onDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, refresh]);

  async function markRead(id: string) {
    await fetch(`/api/v1/notifications/${id}/read`, { method: "POST" }).catch(() => undefined);
    setRows((current) => current?.map((row) => (row.id === id ? { ...row, readAt: new Date().toISOString() } : row)) ?? null);
    setUnread((current) => Math.max(0, current - 1));
  }

  async function markAllRead() {
    await fetch("/api/v1/notifications/read", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => undefined);
    setRows((current) => current?.map((row) => ({ ...row, readAt: row.readAt ?? new Date().toISOString() })) ?? null);
    setUnread(0);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="relative grid h-9 w-9 place-items-center rounded-full border border-line text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4">
          <path d="M12 2a6 6 0 00-6 6v3.6l-1.7 3.1A1 1 0 005.2 16h13.6a1 1 0 00.9-1.3L18 11.6V8a6 6 0 00-6-6zm0 20a3 3 0 002.8-2H9.2a3 3 0 002.8 2z" />
        </svg>
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-[18px] text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 z-50 mt-1 w-80 card rounded-xl shadow-lg">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="text-sm font-medium text-fg">Notifications</p>
            {unread > 0 ? (
              <button type="button" onClick={markAllRead} className="text-xs text-muted hover:text-fg">
                Mark all read
              </button>
            ) : null}
          </div>
          <ul className="max-h-96 divide-y divide-line overflow-auto">
            {rows === null ? (
              <li className="px-4 py-3 text-xs text-muted">Loading…</li>
            ) : rows.length === 0 ? (
              <li className="px-4 py-4 text-xs text-muted">
                Nothing yet. Failed jobs, locked accounts and undelivered mail will show up here.
              </li>
            ) : (
              rows.map((row) => (
                <li key={row.id} className={`px-4 py-3 ${row.readAt ? "" : "bg-accent-soft/20"}`}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!row.readAt) void markRead(row.id);
                      if (row.href) {
                        setOpen(false);
                        router.push(row.href);
                      }
                    }}
                    className="w-full text-left"
                  >
                    <span className="flex items-start gap-2">
                      <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${row.severity === "CRITICAL" ? "bg-red-500" : row.severity === "WARNING" ? "bg-amber-500" : "bg-sky-500"}`} />
                      <span className="min-w-0">
                        <span className={`block text-sm ${row.readAt ? "text-muted" : "font-medium text-fg"}`}>{row.title}</span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-muted line-clamp-2">{row.body}</span>
                        <span className="mt-1 block text-[11px] text-faint">{new Date(row.createdAt).toLocaleString("en-IN")}</span>
                      </span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <div className="border-t border-line px-4 py-2 text-center">
            <Link href="/notifications" onClick={() => setOpen(false)} className="text-xs text-muted hover:text-fg">
              View all
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
