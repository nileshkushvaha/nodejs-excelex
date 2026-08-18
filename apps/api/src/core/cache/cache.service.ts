import { Injectable, Logger } from "@nestjs/common";

import { InvariantError } from "../errors/app-error";
import { RedisService } from "../redis/redis.service";
import {
  CACHE_KEY_PATTERN,
  CACHE_NAMESPACES,
  type CacheNamespace,
  isCacheNamespace,
} from "./cache.namespaces";

/**
 * The application cache, on the shared Redis, scoped by client.
 *
 * Client-scoped in the key rather than by convention, because a cache is the
 * one place where the database's row-level security cannot help: whatever is
 * written here is read back by whoever asks for the same key. Putting the
 * client id in the key means a request for client A physically cannot name a
 * key that belongs to client B, which is the same reasoning as everywhere
 * else in this codebase — make the wrong thing inexpressible rather than
 * forbidden. Platform-wide entries (reference data no client owns) use the
 * literal "platform" where a client id would go.
 *
 * Every Redis failure degrades to a miss. A cache that throws turns a slow
 * request into a failed one, which is the opposite of what a cache is for; so
 * `get` and `set` swallow, log at debug, and the loader runs. Only the
 * namespace check throws, because a namespace not in the list is a bug in
 * this process, not a condition of the environment.
 *
 * Hit and miss counts live in a Redis hash so several API processes report
 * one figure, incremented fire-and-forget because a stats write must never
 * slow down the read it is counting. The in-process counters are the fallback
 * for when Redis is unreachable and there is nothing to report otherwise.
 */
export type CacheScope = { clientId: string } | "platform";

export interface CacheStats {
  hits: number;
  misses: number;
}

const SCAN_BATCH = 500;

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly local = new Map<string, CacheStats>();

  constructor(private readonly redis: RedisService) {}

  // ── Keys ─────────────────────────────────────────────────────────────────

  static scopeId(scope: CacheScope): string {
    return scope === "platform" ? "platform" : scope.clientId;
  }

  /** The prefix every key in one client's namespace shares, ending in a colon. */
  namespacePrefix(scope: CacheScope, namespace: CacheNamespace): string {
    this.assertNamespace(namespace);
    return this.redis.key("cache", CacheService.scopeId(scope), namespace) + ":";
  }

  /** The prefix for everything one scope has cached, ending in a colon. */
  scopePrefix(scope: CacheScope): string {
    return this.redis.key("cache", CacheService.scopeId(scope)) + ":";
  }

  fullKey(scope: CacheScope, namespace: CacheNamespace, key: string): string {
    this.assertNamespace(namespace);
    if (!CACHE_KEY_PATTERN.test(key)) {
      // A programming error, not a user's: keys are built by code. Named so
      // it can be found if a feature ever forwards raw input here.
      throw new InvariantError("cache_key_invalid", `Cache key "${key}" is not a plain segment.`);
    }
    return this.namespacePrefix(scope, namespace) + key;
  }

  statsKey(scope: CacheScope): string {
    return this.redis.key("cache", "stats", CacheService.scopeId(scope));
  }

  ttlFor(namespace: CacheNamespace): number {
    this.assertNamespace(namespace);
    return CACHE_NAMESPACES[namespace].ttlSeconds;
  }

  private assertNamespace(namespace: string): asserts namespace is CacheNamespace {
    if (!isCacheNamespace(namespace)) {
      throw new InvariantError(
        "cache_namespace_unknown",
        `"${namespace}" is not a cache namespace. Add it to CACHE_NAMESPACES first.`,
      );
    }
  }

  // ── Reads and writes ─────────────────────────────────────────────────────

  async get<T>(scope: CacheScope, namespace: CacheNamespace, key: string): Promise<T | undefined> {
    const full = this.fullKey(scope, namespace, key);
    try {
      const raw = await this.redis.connection.get(full);
      if (raw === null) {
        this.count(scope, namespace, "misses");
        return undefined;
      }
      this.count(scope, namespace, "hits");
      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger.debug(`get ${full} failed: ${(error as Error).message}`);
      this.count(scope, namespace, "misses");
      return undefined;
    }
  }

  async set(
    scope: CacheScope,
    namespace: CacheNamespace,
    key: string,
    value: unknown,
    ttlSeconds?: number,
  ): Promise<void> {
    const full = this.fullKey(scope, namespace, key);
    const ttl = ttlSeconds ?? this.ttlFor(namespace);
    try {
      await this.redis.connection.set(full, JSON.stringify(value), "EX", Math.max(1, ttl));
    } catch (error) {
      this.logger.debug(`set ${full} failed: ${(error as Error).message}`);
    }
  }

  async getOrSet<T>(
    scope: CacheScope,
    namespace: CacheNamespace,
    key: string,
    loader: () => Promise<T>,
    ttlSeconds?: number,
  ): Promise<T> {
    const cached = await this.get<T>(scope, namespace, key);
    if (cached !== undefined) return cached;

    const value = await loader();
    // `undefined` is not JSON; a loader returning it means "nothing to keep".
    if (value !== undefined) await this.set(scope, namespace, key, value, ttlSeconds);
    return value;
  }

  async del(scope: CacheScope, namespace: CacheNamespace, key: string): Promise<boolean> {
    const full = this.fullKey(scope, namespace, key);
    try {
      return (await this.redis.connection.unlink(full)) > 0;
    } catch (error) {
      this.logger.debug(`del ${full} failed: ${(error as Error).message}`);
      return false;
    }
  }

  // ── Invalidation ─────────────────────────────────────────────────────────

  /** Removes every key in one client's namespace. Returns how many went. */
  invalidateNamespace(scope: CacheScope, namespace: CacheNamespace): Promise<number> {
    return this.unlinkByPrefix(this.namespacePrefix(scope, namespace));
  }

  /** Removes everything one scope has cached, across every namespace. */
  invalidateAll(scope: CacheScope): Promise<number> {
    return this.unlinkByPrefix(this.scopePrefix(scope));
  }

  /**
   * SCAN then UNLINK in batches, never KEYS. KEYS blocks the server for the
   * whole keyspace, which on a shared Redis stalls the queue as well as the
   * cache. The prefix is always one this class constructed, so a caller
   * cannot aim this at the queue.
   */
  private async unlinkByPrefix(prefix: string): Promise<number> {
    if (!prefix.startsWith(this.redis.key("cache") + ":")) {
      throw new InvariantError("cache_prefix_escape", "Refusing to unlink outside the cache prefix.");
    }

    let cursor = "0";
    let removed = 0;
    try {
      do {
        const [next, keys] = await this.redis.connection.scan(
          cursor,
          "MATCH",
          `${escapeGlob(prefix)}*`,
          "COUNT",
          SCAN_BATCH,
        );
        cursor = next;
        if (keys.length > 0) removed += await this.redis.connection.unlink(...keys);
      } while (cursor !== "0");
    } catch (error) {
      this.logger.debug(`invalidate ${prefix} failed: ${(error as Error).message}`);
    }
    return removed;
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  private count(scope: CacheScope, namespace: CacheNamespace, field: "hits" | "misses"): void {
    const localKey = `${CacheService.scopeId(scope)}:${namespace}`;
    const entry = this.local.get(localKey) ?? { hits: 0, misses: 0 };
    entry[field] += 1;
    this.local.set(localKey, entry);

    this.redis.connection.hincrby(this.statsKey(scope), `${namespace}:${field}`, 1).catch(() => {});
  }

  /** Redis-wide counters when reachable, this process's own otherwise. */
  async stats(scope: CacheScope): Promise<Record<CacheNamespace, CacheStats>> {
    const result = {} as Record<CacheNamespace, CacheStats>;
    let hash: Record<string, string> | null = null;
    try {
      hash = await this.redis.connection.hgetall(this.statsKey(scope));
    } catch {
      hash = null;
    }

    for (const namespace of Object.keys(CACHE_NAMESPACES) as CacheNamespace[]) {
      if (hash) {
        result[namespace] = {
          hits: Number(hash[`${namespace}:hits`] ?? 0),
          misses: Number(hash[`${namespace}:misses`] ?? 0),
        };
      } else {
        const local = this.local.get(`${CacheService.scopeId(scope)}:${namespace}`);
        result[namespace] = { hits: local?.hits ?? 0, misses: local?.misses ?? 0 };
      }
    }
    return result;
  }

  async resetStats(scope: CacheScope): Promise<void> {
    for (const namespace of Object.keys(CACHE_NAMESPACES)) {
      this.local.delete(`${CacheService.scopeId(scope)}:${namespace}`);
    }
    try {
      await this.redis.connection.unlink(this.statsKey(scope));
    } catch (error) {
      this.logger.debug(`reset stats failed: ${(error as Error).message}`);
    }
  }
}

/** Client ids and namespaces contain no glob characters, but the environment name might one day. */
export function escapeGlob(value: string): string {
  return value.replace(/[*?[\]\\]/g, (char) => `\\${char}`);
}
