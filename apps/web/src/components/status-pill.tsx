/**
 * A small coloured pill for a status word.
 *
 * Four tones, deliberately: healthy, worth a look, wrong, and neutral. A
 * screen that invents a fifth colour for "sort of fine" is a screen nobody
 * can read at a glance, and at-a-glance is the only reason a pill exists.
 */
export type PillTone = "green" | "amber" | "red" | "slate";

const TONES: Record<PillTone, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-500/30",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-500/30",
  red: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-500/30",
  slate: "bg-surface-3 text-muted ring-line",
};

export function StatusPill({
  tone,
  children,
  title,
}: {
  tone: PillTone;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
