import { SetMetadata } from "@nestjs/common";

/**
 * A per-route limit, overriding the global one.
 *
 * `subject` says what is being counted: the caller's IP (the default, and
 * the only thing known before authentication), or the signed-in actor —
 * useful for an expensive endpoint where one person hammering it should not
 * cost everyone behind the same office address.
 */
export interface RateLimitOptions {
  /** Hits allowed per window. 0 disables limiting for the route. */
  readonly limit: number;
  readonly windowSeconds: number;
  readonly subject?: "ip" | "actor";
  /** Names the bucket in Redis and in metrics; defaults to the route. */
  readonly bucket?: string;
}

export const RATE_LIMIT_KEY = "rate-limit";

export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);
