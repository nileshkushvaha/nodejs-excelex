import type { PillTone } from "@/components/status-pill";
import type { JobStatus } from "@/lib/api";

/**
 * The little formatters the System screens share.
 *
 * Here rather than in each manager because "1.2 s" and "3 min ago" should be
 * spelt the same on the queue monitor and the scheduler, and a formatter
 * copied twice drifts.
 */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "medium", hour12: false });
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1_000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)} s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1_000)} s`;
  return `${(ms / 3_600_000).toFixed(1)} h`;
}

/** "in 3 min", "2 h ago" — signed, so it reads for the future and the past. */
export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const delta = new Date(iso).getTime() - now;
  const abs = Math.abs(delta);
  const unit =
    abs < 60_000
      ? `${Math.round(abs / 1_000)} s`
      : abs < 3_600_000
        ? `${Math.round(abs / 60_000)} min`
        : abs < 86_400_000
          ? `${(abs / 3_600_000).toFixed(1)} h`
          : `${(abs / 86_400_000).toFixed(1)} d`;
  return delta >= 0 ? `in ${unit}` : `${unit} ago`;
}

export function jobStatusTone(status: JobStatus | string | null | undefined): PillTone {
  switch (status) {
    case "SUCCEEDED":
      return "green";
    case "RUNNING":
      return "amber";
    case "FAILED":
      return "red";
    default:
      return "slate";
  }
}

export function pretty(value: unknown): string {
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
