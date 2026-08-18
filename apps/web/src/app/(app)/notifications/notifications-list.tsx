"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Pager } from "@/components/pager";
import { StatusPill } from "@/components/status-pill";
import type { NotificationPage } from "@/lib/api";
import { markNotificationsRead } from "./actions";

export function NotificationsList({ page }: { page: NotificationPage | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const unreadOnly = params.get("unread") === "1";

  if (!page) return <p className="text-sm text-muted">Notifications could not be loaded.</p>;

  const toggleUnread = () => {
    const next = new URLSearchParams(params.toString());
    if (unreadOnly) next.delete("unread");
    else next.set("unread", "1");
    next.delete("page");
    start(() => router.replace(`${pathname}?${next.toString()}`));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={unreadOnly} onChange={toggleUnread} /> Unread only
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => { await markNotificationsRead(); router.refresh(); })}
          className="btn-secondary rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-60"
        >
          Mark all read
        </button>
      </div>

      {page.rows.length === 0 ? (
        <p className="card rounded-xl p-6 text-center text-sm text-muted">Nothing here{unreadOnly ? " that is unread" : " yet"}.</p>
      ) : (
        <ul className="card divide-y divide-line rounded-xl">
          {page.rows.map((row) => (
            <li key={row.id} className={`flex items-start gap-3 px-4 py-3 ${row.readAt ? "" : "bg-accent-soft/15"}`}>
              <span aria-hidden className={`mt-2 h-2 w-2 shrink-0 rounded-full ${row.severity === "CRITICAL" ? "bg-red-500" : row.severity === "WARNING" ? "bg-amber-500" : "bg-sky-500"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <p className={`text-sm ${row.readAt ? "text-muted" : "font-medium text-fg"}`}>{row.title}</p>
                  <span className="font-mono text-[11px] text-faint">{row.kind}</span>
                  {row.emailed ? <StatusPill tone="slate">emailed</StatusPill> : null}
                </div>
                <p className="mt-0.5 text-sm leading-relaxed text-muted">{row.body}</p>
                <p className="mt-1 text-xs text-faint">
                  {new Date(row.createdAt).toLocaleString("en-IN")}
                  {row.href ? (
                    <>
                      {" · "}
                      <Link href={row.href} className="underline-offset-2 hover:underline">
                        Open
                      </Link>
                    </>
                  ) : null}
                </p>
              </div>
              {!row.readAt ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => start(async () => { await markNotificationsRead([row.id]); router.refresh(); })}
                  className="text-xs text-muted hover:text-fg"
                >
                  Mark read
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Pager page={page.page} pageCount={page.pageCount} total={page.total} pageSize={page.pageSize} />
    </div>
  );
}
