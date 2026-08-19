import type { PillTone } from "@/components/status-pill";
import type { CmsStatus } from "@/lib/api";

/**
 * Status words, tones and the date format, shared by the lists, the editor
 * sidebar and the overview. In a plain module rather than the list component
 * because a "use client" file's exports become client references, and a
 * server component reading STATUS_TONE.PUBLISHED from one would get a proxy
 * that throws rather than a string.
 */
export const STATUS_TONE: Record<CmsStatus, PillTone> = {
  PUBLISHED: "green",
  SCHEDULED: "amber",
  DRAFT: "slate",
  ARCHIVED: "slate",
  TRASH: "red",
};

export const STATUS_LABEL: Record<CmsStatus, string> = {
  PUBLISHED: "Published",
  SCHEDULED: "Scheduled",
  DRAFT: "Draft",
  ARCHIVED: "Archived",
  TRASH: "Trash",
};

/** A row's status, honouring the soft-delete timestamp if the API sent one. */
export function statusOf(row: { status: CmsStatus; deletedAt?: string | null }): CmsStatus {
  return row.deletedAt ? "TRASH" : row.status;
}

export function formatWhen(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
}
