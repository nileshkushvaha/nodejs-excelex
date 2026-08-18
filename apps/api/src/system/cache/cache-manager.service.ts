import { Injectable, NotFoundException } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";

import { ActorCache } from "../../auth/actor-cache";
import { parseRedisInfo, type RedisInfo } from "../../core/cache/cache-info";
import {
  CACHE_NAMESPACE_NAMES,
  CACHE_NAMESPACES,
  type CacheNamespace,
} from "../../core/cache/cache.namespaces";
import { CacheService, type CacheScope, escapeGlob } from "../../core/cache/cache.service";
import { requireRequestContext } from "../../core/context/request-context";
import { PrismaService } from "../../core/database/prisma.service";
import { RedisService } from "../../core/redis/redis.service";

export interface NamespaceOverview {
  name: CacheNamespace;
  label: string;
  description: string;
  ttlSeconds: number;
  keys: number;
  approximate: boolean;
  hits: number;
  misses: number;
  hitRate: number | null;
}

export interface CacheOverview {
  redis: ({ ok: true; pingMs: number } & RedisInfo) | { ok: false; pingMs: null };
  namespaces: NamespaceOverview[];
  platform: NamespaceOverview[];
  inProcess: { actorCache: { entries: number; ttlMs: number; maxEntries: number } };
  queuePrefixKeys: number;
}

export interface KeyPage {
  keys: Array<{ key: string; ttlSeconds: number | null; bytes: number | null }>;
  cursor: string | null;
}

/** Past this many keys the count stops and is reported as approximate. */
const COUNT_CAP = 5000;
const PAGE_COUNT = 100;

/**
 * What the cache manager screen reads and does.
 *
 * Reads go straight to Redis through the same prefixes the cache itself
 * builds, so the screen can only ever see this client's keys — the client id
 * is in the prefix and comes from the request context, never from the caller.
 * The queue and scheduler live under a different prefix and are counted, not
 * listed, and never flushed from here.
 *
 * Mutations audit through Postgres like every other mutation, because "who
 * flushed the cache and when" is exactly the question asked when a screen
 * shows stale data an hour later.
 */
@Injectable()
export class CacheManagerService {
  constructor(
    private readonly cache: CacheService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * The root module's ActorCache — the one the guard fills. Resolved lazily
   * and non-strictly because it is not exported from any module; a second
   * instance here would report an empty map.
   */
  private actorStats(): { entries: number; ttlMs: number; maxEntries: number } {
    try {
      return this.moduleRef.get(ActorCache, { strict: false }).stats();
    } catch {
      return { entries: 0, ttlMs: 0, maxEntries: 0 };
    }
  }

  private clientScope(): CacheScope {
    const { clientId } = requireRequestContext();
    return { clientId: clientId! };
  }

  // ── Overview ─────────────────────────────────────────────────────────────

  async overview(): Promise<CacheOverview> {
    const scope = this.clientScope();
    const [redis, namespaces, platform, queuePrefixKeys] = await Promise.all([
      this.redisHealth(),
      this.namespaceRows(scope),
      this.namespaceRows("platform"),
      this.countPrefix(this.redis.key("queue") + ":").then((r) => r.count),
    ]);

    return {
      redis,
      namespaces,
      platform,
      inProcess: { actorCache: this.actorStats() },
      queuePrefixKeys,
    };
  }

  private async redisHealth(): Promise<CacheOverview["redis"]> {
    const pingMs = await this.redis.pingMs();
    if (pingMs === null) return { ok: false, pingMs: null };
    try {
      const raw = await this.redis.connection.info();
      return { ok: true, pingMs, ...parseRedisInfo(raw) };
    } catch {
      return { ok: false, pingMs: null };
    }
  }

  private async namespaceRows(scope: CacheScope): Promise<NamespaceOverview[]> {
    const stats = await this.cache.stats(scope);
    return Promise.all(
      CACHE_NAMESPACE_NAMES.map(async (name) => {
        const { count, approximate } = await this.countPrefix(this.cache.namespacePrefix(scope, name));
        const { hits, misses } = stats[name];
        const total = hits + misses;
        return {
          name,
          label: CACHE_NAMESPACES[name].label,
          description: CACHE_NAMESPACES[name].description,
          ttlSeconds: CACHE_NAMESPACES[name].ttlSeconds,
          keys: count,
          approximate,
          hits,
          misses,
          hitRate: total === 0 ? null : hits / total,
        };
      }),
    );
  }

  private async countPrefix(prefix: string): Promise<{ count: number; approximate: boolean }> {
    let cursor = "0";
    let count = 0;
    try {
      do {
        const [next, keys] = await this.redis.connection.scan(
          cursor,
          "MATCH",
          `${escapeGlob(prefix)}*`,
          "COUNT",
          1000,
        );
        cursor = next;
        count += keys.length;
        if (count > COUNT_CAP) return { count, approximate: true };
      } while (cursor !== "0");
    } catch {
      return { count: 0, approximate: true };
    }
    return { count, approximate: false };
  }

  // ── Browsing ─────────────────────────────────────────────────────────────

  async keys(namespace: CacheNamespace, search: string, cursor: string): Promise<KeyPage> {
    const prefix = this.cache.namespacePrefix(this.clientScope(), namespace);
    // The search is a substring; glob characters in it are literal.
    const pattern = search ? `${escapeGlob(prefix)}*${escapeGlob(search)}*` : `${escapeGlob(prefix)}*`;

    const [next, found] = await this.redis.connection.scan(
      /^\d+$/.test(cursor) ? cursor : "0",
      "MATCH",
      pattern,
      "COUNT",
      PAGE_COUNT,
    );

    const keys = await Promise.all(
      found.map(async (full) => ({
        key: full.slice(prefix.length),
        ttlSeconds: await this.ttl(full),
        bytes: await this.memoryUsage(full),
      })),
    );

    return { keys, cursor: next === "0" ? null : next };
  }

  async inspect(namespace: CacheNamespace, key: string) {
    const full = this.cache.fullKey(this.clientScope(), namespace, key);
    const raw = await this.redis.connection.get(full);
    if (raw === null) throw new NotFoundException("That key is not in the cache (it may have expired).");

    let value: unknown = raw;
    try {
      value = JSON.parse(raw);
    } catch {
      // Not JSON: shown as the raw string.
    }
    return { key, value, ttlSeconds: await this.ttl(full), bytes: await this.memoryUsage(full) };
  }

  private async ttl(full: string): Promise<number | null> {
    const pttl = await this.redis.connection.pttl(full);
    return pttl < 0 ? null : Math.round(pttl / 1000);
  }

  /** MEMORY USAGE is absent on some managed offerings; null is "not known". */
  private async memoryUsage(full: string): Promise<number | null> {
    try {
      const bytes = await this.redis.connection.call("MEMORY", "USAGE", full);
      return typeof bytes === "number" ? bytes : null;
    } catch {
      return null;
    }
  }

  // ── Mutations ────────────────────────────────────────────────────────────

  async flushNamespace(namespace: CacheNamespace): Promise<{ count: number }> {
    const count = await this.cache.invalidateNamespace(this.clientScope(), namespace);
    await this.audit("system.cache.flushed", namespace, { namespace, count });
    return { count };
  }

  async deleteKey(namespace: CacheNamespace, key: string): Promise<{ removed: boolean }> {
    const removed = await this.cache.del(this.clientScope(), namespace, key);
    await this.audit("system.cache.key_deleted", `${namespace}:${key}`, { namespace, key, removed });
    return { removed };
  }

  async flushAll(): Promise<{ count: number }> {
    const count = await this.cache.invalidateAll(this.clientScope());
    await this.audit("system.cache.flushed", null, { namespace: "*", count });
    return { count };
  }

  async flushPlatform(namespace: CacheNamespace): Promise<{ count: number }> {
    const count = await this.cache.invalidateNamespace("platform", namespace);
    await this.audit("system.cache.flushed", namespace, { namespace, count, scope: "platform" });
    return { count };
  }

  async resetStats(): Promise<void> {
    await this.cache.resetStats(this.clientScope());
    await this.audit("system.cache.stats_reset", null, {});
  }

  private async audit(action: string, entityId: string | null, metadata: Record<string, unknown>) {
    const { clientId, actor, ip, userAgent } = requireRequestContext();
    await this.prisma.forClient(clientId!, (tx) =>
      tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action,
          entity: "cache",
          entityId,
          metadata,
          ip: ip ?? null,
          userAgent: userAgent ?? null,
        },
      }),
    );
  }
}
