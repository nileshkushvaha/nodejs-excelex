/**
 * A per-day bar chart in plain SVG.
 *
 * Seven to thirty bars is not a charting-library problem. Drawn inline so it
 * renders on the server with the rest of the page, needs no client bundle,
 * and picks up the theme's text colour through currentColor. Each bar can be
 * split into a "good" and a "bad" stack — successes over failures — or left
 * as one series.
 */
export interface MiniBar {
  label: string;
  /** Bottom segment. */
  value: number;
  /** Optional top segment, drawn in the warning colour. */
  bad?: number;
}

export function MiniBars({
  bars,
  height = 56,
  title,
}: {
  bars: readonly MiniBar[];
  height?: number;
  title?: string;
}) {
  const max = Math.max(1, ...bars.map((bar) => bar.value + (bar.bad ?? 0)));
  const gap = 3;
  const width = 200;
  const slot = width / Math.max(1, bars.length);
  const barWidth = Math.max(2, slot - gap);
  const chartHeight = height - 14;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={title ?? "Per-day activity"}
      className="h-14 w-full text-accent"
      preserveAspectRatio="none"
    >
      {bars.map((bar, index) => {
        const total = bar.value + (bar.bad ?? 0);
        const totalHeight = (total / max) * chartHeight;
        const badHeight = ((bar.bad ?? 0) / max) * chartHeight;
        const x = index * slot + gap / 2;
        const top = chartHeight - totalHeight;
        return (
          <g key={bar.label}>
            <title>{`${bar.label}: ${bar.value}${bar.bad ? ` · ${bar.bad} failed` : ""}`}</title>
            {/* A hairline for an empty day, so the axis is not a gap. */}
            <rect x={x} y={chartHeight - 1} width={barWidth} height={1} className="fill-current opacity-20" />
            {badHeight > 0 ? (
              <rect x={x} y={top} width={barWidth} height={badHeight} rx={1} className="fill-red-500/80" />
            ) : null}
            {totalHeight - badHeight > 0 ? (
              <rect
                x={x}
                y={top + badHeight}
                width={barWidth}
                height={totalHeight - badHeight}
                rx={1}
                className="fill-current opacity-80"
              />
            ) : null}
          </g>
        );
      })}
      {bars.length > 0 ? (
        <>
          <text x={0} y={height - 2} className="fill-current opacity-60" fontSize={7}>
            {bars[0]!.label.slice(5)}
          </text>
          <text x={width} y={height - 2} textAnchor="end" className="fill-current opacity-60" fontSize={7}>
            {bars[bars.length - 1]!.label.slice(5)}
          </text>
        </>
      ) : null}
    </svg>
  );
}

/** "18 Aug 2026, 11:03:51 pm" — the whole timestamp, in the reader's locale. */
export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
