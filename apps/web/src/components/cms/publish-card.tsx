"use client";

import { useState } from "react";

import { StatusPill } from "@/components/status-pill";
import type { CmsStatus } from "@/lib/api";
import { formatWhen, STATUS_LABEL, STATUS_TONE } from "./status";

/**
 * Status and the verbs that change it, in the sidebar where WordPress keeps
 * them.
 *
 * Two permissions draw the card: someone who may edit sees Save draft and
 * the status; someone who may also publish sees Publish, Schedule, Unpublish
 * and Trash. The split is deliberate — a writer drafting for review should
 * not be a click away from the live site — and mirrors the API's, so a
 * hidden button is never one the API would have accepted.
 */
export function PublishCard({
  status,
  isNew,
  publishedAt,
  scheduledFor,
  dirty,
  saving,
  savedAt,
  canManage,
  canPublish,
  onSave,
  onPublish,
  onUnpublish,
  onArchive,
  onRestore,
  onTrash,
  onPreview,
}: {
  status: CmsStatus;
  isNew: boolean;
  publishedAt: string | null;
  scheduledFor: string | null;
  dirty: boolean;
  saving: boolean;
  savedAt: Date | null;
  canManage: boolean;
  canPublish: boolean;
  onSave: () => void;
  onPublish: (at: string | null) => void;
  onUnpublish: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onTrash: () => void;
  onPreview: () => void;
}) {
  const [scheduling, setScheduling] = useState(false);
  const [at, setAt] = useState("");

  const secondary =
    "btn-secondary rounded-lg px-3 py-1.5 text-xs disabled:opacity-50";
  const danger =
    "rounded-lg border border-line-strong px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/50";

  return (
    <section className="card rounded-xl">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-fg">Status &amp; visibility</h2>
        <StatusPill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusPill>
      </div>

      <div className="space-y-3 p-4 text-xs">
        <dl className="space-y-1 text-muted">
          {status === "PUBLISHED" ? (
            <div className="flex justify-between gap-2">
              <dt>Published</dt>
              <dd className="tabular-nums text-fg">{formatWhen(publishedAt)}</dd>
            </div>
          ) : null}
          {status === "SCHEDULED" ? (
            <div className="flex justify-between gap-2">
              <dt>Goes live</dt>
              <dd className="tabular-nums text-fg">{formatWhen(scheduledFor)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-2">
            <dt>Changes</dt>
            <dd className={dirty ? "text-amber-700 dark:text-amber-300" : "text-fg"}>
              {saving
                ? "Saving…"
                : dirty
                  ? "Unsaved"
                  : savedAt
                    ? `Saved at ${savedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
                    : isNew
                      ? "Not saved yet"
                      : "Saved"}
            </dd>
          </div>
        </dl>

        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onSave} disabled={saving || (!dirty && !isNew)} className={secondary}>
              {status === "PUBLISHED" ? "Save changes" : "Save draft"}
            </button>
            <button type="button" onClick={onPreview} disabled={isNew} className={secondary}>
              Preview
            </button>
          </div>
        ) : (
          <p className="rounded border border-line bg-surface-2 px-2.5 py-1.5 text-muted">
            You can read this but not change it.
          </p>
        )}

        {canPublish ? (
          <div className="space-y-2 border-t border-line-soft pt-3">
            {status === "TRASH" ? (
              <button type="button" onClick={onRestore} disabled={saving} className={secondary}>
                Restore from trash
              </button>
            ) : status === "ARCHIVED" ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={onRestore} disabled={saving} className={secondary}>
                  Restore to drafts
                </button>
                <button type="button" onClick={onTrash} disabled={saving || isNew} className={danger}>
                  Move to trash
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {status !== "PUBLISHED" ? (
                    <button
                      type="button"
                      onClick={() => onPublish(null)}
                      disabled={saving}
                      className="btn-primary rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-60"
                    >
                      {status === "SCHEDULED" ? "Publish now" : "Publish"}
                    </button>
                  ) : null}
                  <button type="button" onClick={() => setScheduling((open) => !open)} disabled={saving} className={secondary}>
                    {status === "SCHEDULED" ? "Reschedule" : "Schedule…"}
                  </button>
                  {status === "PUBLISHED" || status === "SCHEDULED" ? (
                    <button type="button" onClick={onUnpublish} disabled={saving} className={secondary}>
                      {status === "SCHEDULED" ? "Cancel schedule" : "Unpublish"}
                    </button>
                  ) : null}
                </div>

                {scheduling ? (
                  <form
                    className="flex flex-wrap items-end gap-2 rounded-lg border border-line-soft bg-surface-2 p-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!at) return;
                      onPublish(new Date(at).toISOString());
                      setScheduling(false);
                    }}
                  >
                    <label className="block">
                      <span className="mb-1 block text-[11px] text-muted">Go live at</span>
                      <input
                        type="datetime-local"
                        value={at}
                        onChange={(event) => setAt(event.target.value)}
                        required
                        className="rounded border border-line-strong bg-surface px-2 py-1 text-xs outline-none focus:border-accent"
                      />
                    </label>
                    <button type="submit" className="btn-primary rounded px-2.5 py-1 text-xs font-medium">
                      Schedule
                    </button>
                  </form>
                ) : null}

                <div className="flex flex-wrap gap-2 pt-1">
                  {status === "PUBLISHED" ? (
                    <button type="button" onClick={onArchive} disabled={saving || isNew} className={secondary}>
                      Archive
                    </button>
                  ) : null}
                  <button type="button" onClick={onTrash} disabled={saving || isNew} className={danger}>
                    Move to trash
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
