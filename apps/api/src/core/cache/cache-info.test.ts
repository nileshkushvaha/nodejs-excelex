import { describe, expect, it } from "vitest";

import { parseRedisInfo } from "./cache-info";

/**
 * The INFO parser against a trimmed real transcript, plus the degraded cases
 * a managed Redis produces: missing sections and no keyspace lines.
 */
const SAMPLE = [
  "# Server",
  "redis_version:7.2.4",
  "uptime_in_seconds:86400",
  "",
  "# Clients",
  "connected_clients:4",
  "",
  "# Memory",
  "used_memory:1048576",
  "used_memory_human:1.00M",
  "maxmemory:0",
  "",
  "# Stats",
  "keyspace_hits:120",
  "keyspace_misses:30",
  "evicted_keys:2",
  "",
  "# Keyspace",
  "db0:keys=12,expires=3,avg_ttl=0",
  "db1:keys=5,expires=0,avg_ttl=0",
  "",
].join("\r\n");

describe("parseRedisInfo", () => {
  it("reads the sections the health card shows", () => {
    const info = parseRedisInfo(SAMPLE);
    expect(info.version).toBe("7.2.4");
    expect(info.uptimeSeconds).toBe(86400);
    expect(info.connectedClients).toBe(4);
    expect(info.usedMemoryBytes).toBe(1048576);
    expect(info.usedMemoryHuman).toBe("1.00M");
    expect(info.maxMemoryBytes).toBe(0);
    expect(info.keyspaceHits).toBe(120);
    expect(info.keyspaceMisses).toBe(30);
    expect(info.evictedKeys).toBe(2);
    expect(info.totalKeys).toBe(17);
  });

  it("degrades to zeros and unknowns rather than throwing", () => {
    const info = parseRedisInfo("# Server\r\nredis_version:6.0.0\r\n");
    expect(info.version).toBe("6.0.0");
    expect(info.totalKeys).toBe(0);
    expect(info.usedMemoryHuman).toBe("unknown");
    expect(info.keyspaceHits).toBe(0);
  });

  it("keeps a value that itself contains a colon", () => {
    const info = parseRedisInfo("# Server\nredis_version:a:b\n");
    expect(info.version).toBe("a:b");
  });
});
