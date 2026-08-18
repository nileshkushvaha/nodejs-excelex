/**
 * Reads the parts of Redis `INFO` the cache manager screen shows.
 *
 * A pure function over the raw text, kept apart from the service so it can be
 * tested without a Redis and so the field names it depends on are listed in
 * one place. Redis prints `INFO` as `# Section` headers followed by
 * `field:value` lines; the keyspace section is the odd one out, with
 * `db0:keys=12,expires=3,avg_ttl=0` per database, which is why total keys is
 * summed rather than read.
 *
 * Every number defaults to zero and every string to "unknown" rather than
 * throwing, because a managed Redis (or a proxy such as Twemproxy) may omit
 * sections and a health card that crashes on the health check is worse than
 * one with a blank tile.
 */
export interface RedisInfo {
  version: string;
  uptimeSeconds: number;
  usedMemoryBytes: number;
  usedMemoryHuman: string;
  maxMemoryBytes: number;
  evictedKeys: number;
  keyspaceHits: number;
  keyspaceMisses: number;
  connectedClients: number;
  totalKeys: number;
}

export function parseRedisInfo(raw: string): RedisInfo {
  const fields = new Map<string, string>();
  let totalKeys = 0;

  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const name = line.slice(0, separator);
    const value = line.slice(separator + 1);
    fields.set(name, value);

    if (/^db\d+$/.test(name)) {
      const match = /keys=(\d+)/.exec(value);
      if (match) totalKeys += Number(match[1]);
    }
  }

  const int = (name: string) => {
    const parsed = Number(fields.get(name));
    return Number.isFinite(parsed) ? parsed : 0;
  };

  return {
    version: fields.get("redis_version") ?? "unknown",
    uptimeSeconds: int("uptime_in_seconds"),
    usedMemoryBytes: int("used_memory"),
    usedMemoryHuman: fields.get("used_memory_human") ?? "unknown",
    maxMemoryBytes: int("maxmemory"),
    evictedKeys: int("evicted_keys"),
    keyspaceHits: int("keyspace_hits"),
    keyspaceMisses: int("keyspace_misses"),
    connectedClients: int("connected_clients"),
    totalKeys,
  };
}
