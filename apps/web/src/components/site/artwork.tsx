/**
 * The abstract imagery.
 *
 * Drawn rather than photographed, for reasons that are practical before they
 * are aesthetic: it is a few kilobytes instead of a few hundred, it is sharp
 * on every display, it recolours itself with the theme, and it never shows a
 * warehouse that is not ours. Everything here uses the brand tokens, so
 * changing the palette changes the art.
 */

/**
 * The hero piece: a route between two points, on an orbiting field.
 *
 * It is a network abstracted to the two things a courier network is — nodes,
 * and the movement between them. The dashes travel along the path, which is
 * the only literal thing in it and the only part anyone will consciously read.
 */
export function RouteArt({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 520 520"
      role="img"
      aria-label="An abstract courier network: two hubs joined by a moving route"
      className={className}
    >
      <defs>
        <linearGradient id="route-stroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--brand-blue)" />
          <stop offset="55%" stopColor="var(--brand-cyan)" />
          <stop offset="100%" stopColor="var(--brand-mint)" />
        </linearGradient>
        <linearGradient id="route-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--brand-blue)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--brand-cyan)" stopOpacity="0.04" />
        </linearGradient>
        <radialGradient id="route-glow">
          <stop offset="0%" stopColor="var(--brand-cyan)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--brand-cyan)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="260" cy="260" r="250" fill="url(#route-glow)" opacity="0.5" />

      {/* Orbits. Three, at decreasing opacity, so the eye reads depth without
          anything actually being in perspective. */}
      {[240, 186, 132].map((r, index) => (
        <circle
          key={r}
          cx="260"
          cy="260"
          r={r}
          fill="none"
          stroke="url(#route-stroke)"
          strokeOpacity={0.35 - index * 0.08}
          strokeWidth="1"
          strokeDasharray={index === 1 ? "3 9" : undefined}
        />
      ))}

      <circle cx="260" cy="260" r="132" fill="url(#route-fill)" />

      {/* The route. Two curves so it reads as a journey rather than a line. */}
      <path
        d="M104 356 C 170 300, 190 190, 260 160 S 380 190, 416 150"
        fill="none"
        stroke="url(#route-stroke)"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.9"
      />
      <path
        d="M104 356 C 170 300, 190 190, 260 160 S 380 190, 416 150"
        fill="none"
        stroke="var(--brand-mint)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="10 22"
        className="animate-dash"
      />

      {/* The two ends of it. */}
      <Node x={104} y={356} label="origin" />
      <Node x={416} y={150} label="destination" />

      {/* Waypoints — scans between hubs, unlabelled because the shape is the
          point and a legend would make this a diagram. */}
      {[
        [196, 246],
        [300, 176],
        [352, 214],
        [156, 300],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="3.5" fill="var(--brand-cyan)" opacity="0.7" />
      ))}
    </svg>
  );
}

function Node({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <g>
      {/* The ping. Staggered by node so they do not pulse in unison, which
          would read as a loading state rather than as activity. */}
      <circle
        cx={x}
        cy={y}
        r="18"
        fill="var(--brand-cyan)"
        opacity="0.25"
        style={{
          transformOrigin: `${x}px ${y}px`,
          animation: `excelex-pulse-ring 3.2s ease-out infinite`,
          animationDelay: label === "origin" ? "0s" : "1.6s",
        }}
      />
      <circle cx={x} cy={y} r="10" fill="var(--surface)" stroke="url(#route-stroke)" strokeWidth="2.5" />
      <circle cx={x} cy={y} r="3.5" fill="var(--brand-blue)" />
    </g>
  );
}

/** A quieter mark for section corners — concentric arcs, no animation. */
export function ArcArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 300" aria-hidden className={className}>
      <defs>
        <linearGradient id="arc-stroke" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--brand-blue)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--brand-mint)" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {[60, 110, 160, 210, 260].map((r) => (
        <circle
          key={r}
          cx="300"
          cy="300"
          r={r}
          fill="none"
          stroke="url(#arc-stroke)"
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
}

/**
 * One path per service, drawn rather than pulled from an icon set — four
 * icons is not worth a dependency, and these have to sit on a gradient tile
 * at 24px, which is a constraint a general-purpose set does not know about.
 */
const ICONS = {
  /** A parcel. */
  domestic: "M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3M4 7.5l8 4.5 8-4.5M12 12v9",
  /** A globe. */
  international:
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3c2.4 2.7 2.4 15.3 0 18M12 3c-2.4 2.7-2.4 15.3 0 18",
  /** A lorry. */
  surface: "M3 7h10v9H3zM13 10.5h4l3 3V16h-7zM7.5 18.5a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2M17 18.5a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2",
  /** A basket. */
  ecommerce: "M3 5h2l2.2 9.5h9.3L19 8H6M9.5 19.5a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4M16.5 19.5a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4",
} as const;

/** A line icon on the brand tile. Stroked, so it stays crisp at any size. */
export function ServiceIcon({ name, className = "" }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d={ICONS[name]} />
    </svg>
  );
}
