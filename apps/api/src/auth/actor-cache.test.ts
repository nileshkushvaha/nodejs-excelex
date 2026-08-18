import { describe, expect, it } from "vitest";

import { ActorCache } from "./actor-cache";
import type { AuthenticatedActor } from "./auth.service";

const actor = (userId: string): AuthenticatedActor => ({
  userId,
  email: `${userId}@example.test`,
  fullName: userId,
  permissions: [],
  grants: { roles: [], direct: [] },
  branchIds: [],
});

describe("ActorCache", () => {
  it("returns what it was given", () => {
    const cache = new ActorCache();
    const one = actor("u1");

    cache.set("hash-1", one);

    expect(cache.get("hash-1")).toBe(one);
    expect(cache.get("hash-unknown")).toBeUndefined();
  });

  it("forgets a single session, for sign-out", () => {
    const cache = new ActorCache();
    cache.set("hash-1", actor("u1"));

    cache.forget("hash-1");

    // The security property: a revoked session must not be answerable from
    // memory after the revocation is written.
    expect(cache.get("hash-1")).toBeUndefined();
  });

  it("forgets every session of one user without touching another's", () => {
    const cache = new ActorCache();
    cache.set("laptop", actor("u1"));
    cache.set("phone", actor("u1"));
    cache.set("colleague", actor("u2"));

    cache.forgetUser("u1");

    expect(cache.get("laptop")).toBeUndefined();
    expect(cache.get("phone")).toBeUndefined();
    expect(cache.get("colleague")).toBeDefined();
  });

  it("clears everything, for a role change that affects unknown holders", () => {
    const cache = new ActorCache();
    cache.set("a", actor("u1"));
    cache.set("b", actor("u2"));

    cache.clear();

    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBeUndefined();
  });

  it("expires an entry rather than serving it for ever", async () => {
    const cache = new ActorCache();
    cache.set("hash-1", actor("u1"));

    // Reaching into the entry rather than waiting ten seconds: the behaviour
    // under test is that an expired entry is not returned, not the clock.
    const entries = cache as unknown as { entries: Map<string, { expiresAt: number }> };
    entries.entries.get("hash-1")!.expiresAt = Date.now() - 1;

    expect(cache.get("hash-1")).toBeUndefined();
  });

  it("stays bounded when flooded with one-off tokens", () => {
    const cache = new ActorCache();

    // A burst of tokens that never repeat — a scanner, or an attacker probing
    // with random cookies — must not grow this without limit.
    for (let index = 0; index < 10_050; index += 1) {
      cache.set(`hash-${index}`, actor("u1"));
    }

    const entries = cache as unknown as { entries: Map<string, unknown> };
    expect(entries.entries.size).toBeLessThanOrEqual(10_000);
    // The most recent survives; the oldest were evicted.
    expect(cache.get("hash-10049")).toBeDefined();
    expect(cache.get("hash-0")).toBeUndefined();
  });
});
