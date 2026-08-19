"use client";

import { useState, useTransition } from "react";

import { listRevisions, readRevision, restoreRevision } from "@/app/(app)/content/content-actions";
import { MasterDialog } from "@/components/master-dialog";
import type { CmsCollection, CmsRevisionDetail, CmsRevisionSummary } from "@/lib/api";
import { formatWhen } from "./status";

/**
 * The revision history, loaded when asked for.
 *
 * Every save writes a revision, so a page that has been edited for a year
 * has hundreds; fetching them with the editor would slow the common case to
 * serve the rare one. The card shows the count the row already carries and
 * fetches the list on "Browse". Restore hands the chosen revision back to the
 * editor as its new state — the API has already written it — and the editor
 * reloads from that.
 */
export function RevisionsPanel({
  collection,
  contentId,
  count,
  canManage,
  onRestored,
}: {
  collection: CmsCollection;
  contentId: string | null;
  count: number;
  canManage: boolean;
  onRestored: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<CmsRevisionSummary[] | null>(null);
  const [detail, setDetail] = useState<CmsRevisionDetail | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function browse() {
    if (!contentId) return;
    setOpen(true);
    startTransition(async () => {
      setRows(await listRevisions(collection, contentId));
    });
  }

  function view(revisionId: string) {
    if (!contentId) return;
    startTransition(async () => {
      setDetail(await readRevision(collection, contentId, revisionId));
    });
  }

  function restore(revisionId: string) {
    if (!contentId) return;
    if (!window.confirm("Restore this revision? The current content is kept as a revision too.")) return;
    setError(undefined);
    startTransition(async () => {
      const result = await restoreRevision(collection, contentId, revisionId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setDetail(null);
      onRestored();
    });
  }

  return (
    <section className="card rounded-xl">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-fg">Revisions</h2>
        <span className="text-xs tabular-nums text-muted">{count}</span>
      </div>
      <div className="p-4 text-xs">
        {contentId ? (
          <button type="button" onClick={browse} className="btn-secondary rounded-lg px-3 py-1.5 text-xs">
            Browse revisions
          </button>
        ) : (
          <p className="text-faint">Revisions appear once this has been saved.</p>
        )}
      </div>

      <MasterDialog
        open={open}
        title="Revisions"
        description="Every save, newest first. Restoring writes a new revision, so nothing is lost."
        onClose={() => {
          setOpen(false);
          setDetail(null);
        }}
        wide
      >
        {error ? <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
        {detail ? (
          <div className="space-y-3">
            <button type="button" onClick={() => setDetail(null)} className="text-xs text-muted hover:text-fg">
              ← Back to the list
            </button>
            <div className="text-xs text-muted">
              <p>
                <span className="font-medium text-fg">{detail.title}</span> · {formatWhen(detail.createdAt)} ·{" "}
                {detail.author?.fullName ?? "system"} · {detail.reason}
              </p>
              <p className="font-mono text-[11px] text-faint">/{detail.slug}</p>
            </div>
            <div
              className="prose-cms max-h-96 overflow-y-auto rounded-lg border border-line-soft bg-surface-2 p-4 text-sm"
              // The API sanitised this on the way in; it is our own stored HTML.
              dangerouslySetInnerHTML={{ __html: detail.body }}
            />
            {canManage ? (
              <button type="button" onClick={() => restore(detail.id)} disabled={pending} className="btn-primary rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-60">
                Restore this revision
              </button>
            ) : null}
          </div>
        ) : rows === null ? (
          <p className="text-xs text-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted">No revisions yet.</p>
        ) : (
          <ul className="divide-y divide-line-soft text-xs">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="tabular-nums text-fg">{formatWhen(row.createdAt)}</span>
                <span className="text-muted">{row.author?.fullName ?? "system"}</span>
                <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] uppercase text-muted">{row.reason}</span>
                <span className="truncate text-muted">{row.title}</span>
                <span className="text-faint tabular-nums">{row.bodyLength.toLocaleString("en-IN")} chars</span>
                <span className="ml-auto flex gap-2">
                  <button type="button" onClick={() => view(row.id)} className="text-accent-text hover:underline">
                    View
                  </button>
                  {canManage ? (
                    <button type="button" onClick={() => restore(row.id)} disabled={pending} className="text-accent-text hover:underline disabled:opacity-50">
                      Restore
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </MasterDialog>
    </section>
  );
}
