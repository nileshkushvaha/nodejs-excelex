/**
 * The closed list of things the application caches.
 *
 * Closed on purpose. An open string namespace is how a cache fills with keys
 * nobody can name six months later, and how a "flush this area" button ends
 * up with an area nobody can enumerate. Every namespace declares its default
 * TTL here so the number lives next to the reasoning, and so the cache
 * manager screen can show an operator what a namespace is for without a
 * lookup table of its own.
 *
 * TTLs are chosen by how expensive staleness is, not by how expensive the
 * load is. Settings change rarely and are invalidated on write, so five
 * minutes is a safety net rather than the mechanism. Reference data changes
 * with a migration. Permission sets are the one where a stale read is a
 * security question, hence the shortest window. Dashboard figures are only
 * ever approximately current, so thirty seconds is honest.
 */
export const CACHE_NAMESPACES = {
  settings: {
    label: "Settings",
    description: "Client and security settings, invalidated whenever they are saved.",
    ttlSeconds: 300,
  },
  reference: {
    label: "Reference data",
    description: "Countries and states — platform-wide, shared by every account.",
    ttlSeconds: 3600,
  },
  permissions: {
    label: "Permissions",
    description: "Resolved role permission sets.",
    ttlSeconds: 60,
  },
  rates: {
    label: "Rates",
    description: "Rate lookups for pricing.",
    ttlSeconds: 600,
  },
  dashboard: {
    label: "Dashboard",
    description: "Summary figures for the dashboard.",
    ttlSeconds: 30,
  },
} as const;

export type CacheNamespace = keyof typeof CACHE_NAMESPACES;

export const CACHE_NAMESPACE_NAMES = Object.keys(CACHE_NAMESPACES) as CacheNamespace[];

export function isCacheNamespace(value: string): value is CacheNamespace {
  return Object.prototype.hasOwnProperty.call(CACHE_NAMESPACES, value);
}

/**
 * What a key segment may look like. Letters, digits, dot, dash and underscore:
 * enough for "security", "states:IN" is deliberately not allowed — a colon in
 * a segment would let a caller compose a key that reads as a different
 * namespace, and a glob character would turn a delete into a pattern.
 */
export const CACHE_KEY_PATTERN = /^[A-Za-z0-9._-]{1,200}$/;
