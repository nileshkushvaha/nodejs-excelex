import { Injectable } from "@nestjs/common";

import type { AuthenticatedActor } from "./auth.service";

/**
 * A short-lived cache of resolved actors, keyed by session token hash.
 *
 * The audit measured what this fixes: every request cost five statements and
 * a write to authenticate, and a page composing from seven API calls paid it
 * seven times — about forty-two database round trips before any of the data
 * the screen actually wanted.
 *
 * The trade is bounded staleness. A permission revoked mid-session takes
 * effect within TTL_MS rather than instantly. Ten seconds is chosen so the
 * worst case is shorter than the time it takes to tell somebody their access
 * has changed, while still removing almost all of the cost — the seven calls
 * behind one screen land inside a single tick.
 *
 * The cases where instant matters are handled by invalidation rather than by
 * a shorter TTL: signing out, revoking a session, and revoking every session
 * for a user all drop their entries here. What remains stale for ten seconds
 * is a role edit, which is an administrative action nobody performs while
 * expecting the effect within a page load.
 *
 * In memory, so it is per process. That is correct for one API process and
 * still correct for several: each holds its own copy, each expires in ten
 * seconds, and no invalidation crosses processes — which is why the
 * invalidation below is a safety net rather than the mechanism. Moving this
 * to Redis is a swap of this class, not a change to its callers.
 */
const TTL_MS = 10_000;

/** Bounded so a burst of one-off tokens cannot grow this without limit. */
const MAX_ENTRIES = 10_000;

interface Entry {
  readonly actor: AuthenticatedActor;
  readonly expiresAt: number;
}

@Injectable()
export class ActorCache {
  private readonly entries = new Map<string, Entry>();

  get(tokenHash: string): AuthenticatedActor | undefined {
    const entry = this.entries.get(tokenHash);
    if (!entry) return undefined;

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(tokenHash);
      return undefined;
    }

    return entry.actor;
  }

  set(tokenHash: string, actor: AuthenticatedActor): void {
    // Evict oldest-first when full. Map preserves insertion order, so the
    // first key is the least recently added — good enough for a ten-second
    // cache, and an LRU would cost more to maintain than it saves.
    if (this.entries.size >= MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest) this.entries.delete(oldest);
    }

    this.entries.set(tokenHash, { actor, expiresAt: Date.now() + TTL_MS });
  }

  forget(tokenHash: string): void {
    this.entries.delete(tokenHash);
  }

  /**
   * Drops every entry for one user, for "sign out everywhere" and for an
   * administrator revoking somebody's access.
   */
  forgetUser(userId: string): void {
    for (const [tokenHash, entry] of this.entries) {
      if (entry.actor.userId === userId) this.entries.delete(tokenHash);
    }
  }

  /** Drops everything. Used when a client is suspended. */
  clear(): void {
    this.entries.clear();
  }

  /** Read-only figures for the cache manager screen; per process, like the cache. */
  stats(): { entries: number; ttlMs: number; maxEntries: number } {
    return { entries: this.entries.size, ttlMs: TTL_MS, maxEntries: MAX_ENTRIES };
  }
}
