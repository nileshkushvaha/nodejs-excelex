import { timingSafeEqual } from "node:crypto";

/**
 * Who may scrape /metrics.
 *
 * The exposition is not client data, but it is a map of the system: every
 * route pattern, every model name, error rates, the version of Node. In
 * production it is served only to a caller holding METRICS_TOKEN. Without a
 * token configured, it is served in development and test — where a scraper
 * on a laptop is the norm — and refused in production, with a message that
 * says what to set rather than a bare 403.
 *
 * The comparison is constant-time so the token cannot be recovered a byte at
 * a time from response timing. Length is checked first because
 * timingSafeEqual throws on unequal buffers, and a throw is both a crash and
 * a length oracle; a mismatched length is simply "no".
 */
export interface MetricsAuthInput {
  readonly nodeEnv: string;
  readonly token: string | undefined;
  readonly authorization: string | undefined;
}

export function metricsScrapeAllowed(input: MetricsAuthInput): boolean {
  if (!input.token) return input.nodeEnv !== "production";

  const header = input.authorization ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return false;

  const presented = Buffer.from(header.slice(7).trim(), "utf8");
  const expected = Buffer.from(input.token, "utf8");
  if (presented.length !== expected.length) return false;
  return timingSafeEqual(presented, expected);
}

/** The sentence a refused scraper is shown, so the fix is in the response. */
export function metricsRefusalMessage(tokenConfigured: boolean): string {
  return tokenConfigured
    ? "A valid bearer token is required to read /metrics. Send Authorization: Bearer <METRICS_TOKEN>."
    : "/metrics is disabled in production until METRICS_TOKEN (at least 16 characters) is set; scrapers then send it as a bearer token.";
}
