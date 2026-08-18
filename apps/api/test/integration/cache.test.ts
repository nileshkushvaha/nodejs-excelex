import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CacheService } from "../../src/core/cache/cache.service";
import { RedisService } from "../../src/core/redis/redis.service";
import { startApi } from "./harness";

/**
 * The cache against a real Redis: caching, counting, and — the property that
 * matters — invalidation that stays inside one client's namespace and never
 * touches the queue.
 */
const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "22222222-2222-4222-8222-222222222222";
const A = { clientId: CLIENT_A };
const B = { clientId: CLIENT_B };

describe("the cache", () => {
  let app: INestApplication;
  let cache: CacheService;
  let redis: RedisService;

  beforeAll(async () => {
    app = await startApi();
    cache = app.get(CacheService);
    redis = app.get(RedisService);
    await cache.invalidateAll(A);
    await cache.invalidateAll(B);
    await cache.resetStats(A);
  });

  afterAll(async () => {
    await cache.invalidateAll(A);
    await cache.invalidateAll(B);
    await app.close();
  });

  it("calls the loader once and serves the copy afterwards", async () => {
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return { answer: 42 };
    };

    const first = await cache.getOrSet(A, "rates", "lane.one", loader, 60);
    const second = await cache.getOrSet(A, "rates", "lane.one", loader, 60);

    expect(first).toEqual({ answer: 42 });
    expect(second).toEqual({ answer: 42 });
    expect(calls).toBe(1);
  });

  it("counts a miss then a hit", async () => {
    await cache.resetStats(A);
    await cache.get(A, "dashboard", "summary");
    await cache.set(A, "dashboard", "summary", { n: 1 });
    await cache.get(A, "dashboard", "summary");
    // The counters are fire-and-forget; give the round trip a moment.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const stats = await cache.stats(A);
    expect(stats.dashboard.misses).toBe(1);
    expect(stats.dashboard.hits).toBe(1);
  });

  it("flushes one client's namespace and leaves the other client's alone", async () => {
    await cache.set(A, "settings", "general", { who: "a" });
    await cache.set(B, "settings", "general", { who: "b" });
    await cache.set(A, "rates", "keep", { who: "a" });

    const removed = await cache.invalidateNamespace(A, "settings");

    expect(removed).toBe(1);
    expect(await cache.get(A, "settings", "general")).toBeUndefined();
    expect(await cache.get(B, "settings", "general")).toEqual({ who: "b" });
    expect(await cache.get(A, "rates", "keep")).toEqual({ who: "a" });
  });

  it("refuses a namespace not on the list", async () => {
    // Programming errors carry a code and keep their explanation internal;
    // the code is the contract, not the sentence.
    await expect(cache.getOrSet(A, "nonsense" as never, "k", async () => 1)).rejects.toMatchObject({
      code: "cache_namespace_unknown",
    });
    expect(() => cache.fullKey(A, "settings", "has:colon")).toThrow(expect.objectContaining({ code: "cache_key_invalid" }));
    expect(() => cache.fullKey(A, "settings", "glob*")).toThrow(expect.objectContaining({ code: "cache_key_invalid" }));
  });

  it("leaves the queue's keys untouched when a client flushes everything", async () => {
    const queueKey = redis.key("queue", "probe", CLIENT_A);
    await redis.connection.set(queueKey, "1", "EX", 60);
    await cache.set(A, "reference", "x", 1);
    await cache.set(A, "permissions", "y", 2);

    const removed = await cache.invalidateAll(A);

    // Earlier tests left entries in other namespaces; the point is that
    // at least these two went and the queue's key did not.
    expect(removed).toBeGreaterThanOrEqual(2);
    expect(await cache.get(A, "reference", "x")).toBeUndefined();
    expect(await redis.connection.get(queueKey)).toBe("1");
    await redis.connection.unlink(queueKey);
  });
});
