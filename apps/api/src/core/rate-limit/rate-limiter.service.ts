import { Injectable, Logger } from "@nestjs/common";

import { RedisService } from "../redis/redis.service";

/**
 * A fixed-window counter in Redis, atomic, shared by every API instance.
 *
 * Fixed windows rather than a sliding log because the log costs a ZSET per
 * key and a round trip per member, and the thing being protected here — a
 * password spray, a runaway client — does not care whether the boundary is
 * exact to the second. The one weakness of a fixed window (twice the limit
 * across a boundary) is accepted and the limits are set with it in mind.
 *
 * Both the increment and the expiry happen in one Lua script, so a crash
 * between INCR and EXPIRE cannot leave a key that counts for ever, and two
 * instances incrementing at once cannot both see "first in window".
 *
 * Fails open. If Redis is unreachable the request is allowed and a warning
 * is logged: the account lockout and the origin check still stand, and
 * refusing every sign-in because the cache is down would turn a Redis
 * outage into a total outage. The performance screen shows Redis health, so
 * a fail-open period is visible rather than silent.
 */
export interface RateLimitVerdict {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  /** Seconds until the window resets — what Retry-After and RateLimit-Reset say. */
  readonly resetSeconds: number;
  /** True when Redis could not be reached and the request was let through. */
  readonly degraded: boolean;
}

// KEYS[1] = counter key; ARGV[1] = window in ms.
// Returns { count, ttlMs }.
const CONSUME_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { count, ttl }
`;

@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);
  private scriptSha: string | undefined;

  constructor(private readonly redis: RedisService) {}

  /**
   * Counts one hit against `bucket` and says whether it fits.
   *
   * `bucket` is a caller-chosen label plus its subject ("login:ip:1.2.3.4");
   * the key is namespaced under the deployment prefix so two environments
   * on one Redis do not throttle each other.
   */
  async consume(bucket: string, limit: number, windowSeconds: number): Promise<RateLimitVerdict> {
    const key = this.redis.key("ratelimit", bucket);
    const windowMs = Math.max(1, Math.round(windowSeconds * 1000));

    try {
      const [count, ttlMs] = await this.run(key, windowMs);
      const resetSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
      return {
        allowed: count <= limit,
        limit,
        remaining: Math.max(0, limit - count),
        resetSeconds,
        degraded: false,
      };
    } catch (error) {
      this.logger.warn({
        event: "ratelimit.degraded",
        bucket: bucket.split(":")[0],
        message: error instanceof Error ? error.message : String(error),
      });
      return { allowed: true, limit, remaining: limit, resetSeconds: windowSeconds, degraded: true };
    }
  }

  /** How many hits a bucket has taken this window, without adding one. */
  async peek(bucket: string): Promise<number> {
    const value = await this.redis.connection.get(this.redis.key("ratelimit", bucket)).catch(() => null);
    return value ? Number(value) : 0;
  }

  /** Forgets a bucket — used by tests and by an administrator clearing a block. */
  async reset(bucket: string): Promise<void> {
    await this.redis.connection.del(this.redis.key("ratelimit", bucket)).catch(() => undefined);
  }

  private async run(key: string, windowMs: number): Promise<[number, number]> {
    const connection = this.redis.connection;
    if (!this.scriptSha) this.scriptSha = (await connection.script("LOAD", CONSUME_SCRIPT)) as string;
    try {
      return (await connection.evalsha(this.scriptSha, 1, key, windowMs)) as [number, number];
    } catch (error) {
      // A Redis restart forgets loaded scripts; load once more and retry.
      if (error instanceof Error && /NOSCRIPT/u.test(error.message)) {
        this.scriptSha = (await connection.script("LOAD", CONSUME_SCRIPT)) as string;
        return (await connection.evalsha(this.scriptSha, 1, key, windowMs)) as [number, number];
      }
      throw error;
    }
  }
}
