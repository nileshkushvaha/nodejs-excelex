"use client";

import { Fragment, useEffect, useState, useTransition } from "react";

import type {
  ActionResult,
  CacheKeyRow,
  CacheKeyValue,
  CacheNamespaceOverview,
  CacheOverview,
} from "@/lib/api";
import {
  browseCacheKeys,
  deleteCacheKey,
  flushAllNamespaces,
  flushNamespace,
  flushPlatformNamespace,
  inspectCacheKey,
  resetCacheStats,
} from "./actions";

/**
 * The cache manager screen.
 *
 * Three cards: what Redis says about itself, what this account has cached
 * (per namespace, with a key browser that opens under a row), and the
 * platform-wide namespaces that every account shares. The last is kept
 * visually apart and its flush warns, because clearing reference data does
 * not affect one account — it makes every account reload it.
 *
 * Confirmation is `window.confirm`: a flush is reversible in the sense that
 * the cache refills itself, so a modal would be more ceremony than the action
 * deserves, but it is still a click that briefly makes every screen slower.
 */
interface Props {
  overview: CacheOverview;
  canManage: boolean;
}

type Notice = { tone: "ok" | "error"; text: string } | null;

export function CacheManager({ overview, canManage }: Props) {
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, startTransition] = useTransition();

  const run = (label: string, action: () => Promise<ActionResult>) => {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        const count = (result.data as { count?: number } | undefined)?.count;
        setNotice({
          tone: "ok",
          text: count === undefined ? `${label} done.` : `${label}: ${count} key${count === 1 ? "" : "s"} removed.`,
        });
      } else {
        setNotice({ tone: "error", text: result.error ?? `${label} failed.` });
      }
    });
  };

  return (
    <div className="space-y-6">
      {notice ? (
        <p
          role="status"
          className={`rounded-lg border px-4 py-2.5 text-sm ${
            notice.tone === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      <RedisHealth redis={overview.redis} queuePrefixKeys={overview.queuePrefixKeys} />

      <section className="card rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-fg">This account</h2>
            <p className="text-xs text-muted">
              Keys are scoped to this account; flushing here affects nobody else.
            </p>
          </div>
          {canManage ? (
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary text-xs"
                disabled={pending}
                onClick={() => {
                  if (window.confirm("Reset hit and miss counters for this account?")) {
                    run("Counters reset", resetCacheStats);
                  }
                }}
              >
                Reset counters
              </button>
              <button
                type="button"
                className="btn-secondary text-xs"
                disabled={pending}
                onClick={() => {
                  if (window.confirm("Flush every cache namespace for this account? Screens will be slower until the cache refills.")) {
                    run("Flush all", flushAllNamespaces);
                  }
                }}
              >
                Flush all
              </button>
            </div>
          ) : null}
        </div>
        <NamespaceTable
          rows={overview.namespaces}
          canManage={canManage}
          browsable
          pending={pending}
          onFlush={(ns) => {
            if (window.confirm(`Flush the "${ns.label}" cache for this account?`)) {
              run(`Flush ${ns.label}`, () => flushNamespace(ns.name));
            }
          }}
          onDeleteKey={(ns, key) => run(`Delete ${key}`, () => deleteCacheKey(ns, key))}
        />
      </section>

      <section className="card rounded-xl border-amber-200 dark:border-amber-900">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-fg">Platform-wide</h2>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Shared by every account. Flushing a namespace here makes every account reload it —
            use it after reference data changes, not to fix one screen.
          </p>
        </div>
        <NamespaceTable
          rows={overview.platform}
          canManage={canManage}
          browsable={false}
          pending={pending}
          onFlush={(ns) => {
            if (
              window.confirm(
                `Flush the platform-wide "${ns.label}" cache? This affects EVERY account, not just this one.`,
              )
            ) {
              run(`Platform flush ${ns.label}`, () => flushPlatformNamespace(ns.name));
            }
          }}
          onDeleteKey={() => undefined}
        />
      </section>

      <section className="card rounded-xl">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-fg">In-process caches</h2>
          <p className="text-xs text-muted">
            Held in the API process's memory, per instance; they expire on their own and cannot
            be flushed from here.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-4 px-4 py-4 text-sm sm:grid-cols-4">
          <Stat label="Actor cache entries" value={String(overview.inProcess.actorCache.entries)} />
          <Stat label="TTL" value={formatDuration(overview.inProcess.actorCache.ttlMs)} />
          <Stat label="Max entries" value={overview.inProcess.actorCache.maxEntries.toLocaleString("en-IN")} />
          <Stat label="Queue prefix keys" value={overview.queuePrefixKeys.toLocaleString("en-IN")} hint="informational" />
        </dl>
      </section>
    </div>
  );
}

// ── Redis health ─────────────────────────────────────────────────────────────

function RedisHealth({ redis, queuePrefixKeys }: { redis: CacheOverview["redis"]; queuePrefixKeys: number }) {
  if (!redis.ok) {
    return (
      <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
        Redis is unreachable. Every cache read is a miss until it is back; the queue is affected too.
      </section>
    );
  }

  const used = redis.usedMemoryBytes ?? 0;
  const max = redis.maxMemoryBytes ?? 0;
  const memoryPct = max > 0 ? Math.min(100, (used / max) * 100) : null;
  const hits = redis.keyspaceHits ?? 0;
  const misses = redis.keyspaceMisses ?? 0;
  const ratio = hits + misses > 0 ? hits / (hits + misses) : null;

  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Tile label="Ping" value={`${(redis.pingMs ?? 0).toFixed(1)} ms`} hint={`Redis ${redis.version ?? ""}`} />
      <Tile
        label="Memory"
        value={redis.usedMemoryHuman ?? formatBytes(used)}
        hint={max > 0 ? `of ${formatBytes(max)}` : "no maxmemory set"}
        bar={memoryPct}
      />
      <Tile
        label="Hit ratio"
        value={ratio === null ? "—" : `${(ratio * 100).toFixed(1)}%`}
        hint="keyspace, since restart"
        bar={ratio === null ? null : ratio * 100}
      />
      <Tile label="Evictions" value={(redis.evictedKeys ?? 0).toLocaleString("en-IN")} hint="keys evicted" />
      <Tile label="Clients" value={String(redis.connectedClients ?? 0)} hint={`${(redis.totalKeys ?? 0).toLocaleString("en-IN")} keys total`} />
      <Tile label="Uptime" value={formatDuration((redis.uptimeSeconds ?? 0) * 1000)} hint={`${queuePrefixKeys} queue keys`} />
    </section>
  );
}

function Tile({ label, value, hint, bar }: { label: string; value: string; hint?: string; bar?: number | null }) {
  return (
    <div className="card relative overflow-hidden rounded-xl p-3">
      <span aria-hidden="true" className="brand-gradient absolute inset-x-0 top-0 h-1 opacity-80" />
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1.5 text-xl font-bold tabular-nums text-fg">{value}</p>
      {hint ? <p className="mt-0.5 truncate text-xs text-faint">{hint}</p> : null}
      {bar !== null && bar !== undefined ? <Bar pct={bar} className="mt-2" /> : null}
    </div>
  );
}

function Bar({ pct, className = "" }: { pct: number; className?: string }) {
  return (
    <div className={`h-1 w-full overflow-hidden rounded-full bg-surface-3 ${className}`} aria-hidden="true">
      <div className="brand-gradient h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular-nums text-fg">
        {value}
        {hint ? <span className="ml-1 text-xs font-normal text-faint">{hint}</span> : null}
      </dd>
    </div>
  );
}

// ── Namespace table ──────────────────────────────────────────────────────────

function NamespaceTable({
  rows,
  canManage,
  browsable,
  pending,
  onFlush,
  onDeleteKey,
}: {
  rows: CacheNamespaceOverview[];
  canManage: boolean;
  browsable: boolean;
  pending: boolean;
  onFlush: (ns: CacheNamespaceOverview) => void;
  onDeleteKey: (namespace: string, key: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-muted">
          <tr className="border-b border-line">
            <th className="px-4 py-2 font-medium">Namespace</th>
            <th className="px-4 py-2 font-medium">Description</th>
            <th className="px-4 py-2 text-right font-medium">TTL</th>
            <th className="px-4 py-2 text-right font-medium">Keys</th>
            <th className="px-4 py-2 text-right font-medium">Hits</th>
            <th className="px-4 py-2 text-right font-medium">Misses</th>
            <th className="px-4 py-2 font-medium">Hit rate</th>
            <th className="px-4 py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          {rows.map((ns) => (
            <Fragment key={ns.name}>
              <tr className="hover:bg-surface-2">
                <td className="px-4 py-2.5">
                  <p className="font-medium text-fg">{ns.label}</p>
                  <p className="font-mono text-xs text-faint">{ns.name}</p>
                </td>
                <td className="max-w-xs px-4 py-2.5 text-muted">{ns.description}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-fg">{formatDuration(ns.ttlSeconds * 1000)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                  {ns.approximate ? "≈ " : ""}
                  {ns.keys.toLocaleString("en-IN")}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-fg">{ns.hits.toLocaleString("en-IN")}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-fg">{ns.misses.toLocaleString("en-IN")}</td>
                <td className="px-4 py-2.5">
                  {ns.hitRate === null ? (
                    <span className="text-xs text-faint">no reads yet</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="w-20">
                        <Bar pct={ns.hitRate * 100} />
                      </div>
                      <span className="tabular-nums text-xs text-fg">{(ns.hitRate * 100).toFixed(0)}%</span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex justify-end gap-2">
                    {browsable ? (
                      <button
                        type="button"
                        className="btn-secondary text-xs"
                        onClick={() => setOpen((current) => (current === ns.name ? null : ns.name))}
                      >
                        {open === ns.name ? "Close" : "Browse"}
                      </button>
                    ) : null}
                    {canManage ? (
                      <button type="button" className="btn-secondary text-xs" disabled={pending} onClick={() => onFlush(ns)}>
                        Flush
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
              {browsable && open === ns.name ? (
                <tr>
                  <td colSpan={8} className="bg-surface-2 px-4 py-3">
                    <KeyBrowser namespace={ns.name} canManage={canManage} onDelete={(key) => onDeleteKey(ns.name, key)} />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Key browser ──────────────────────────────────────────────────────────────

function KeyBrowser({
  namespace,
  canManage,
  onDelete,
}: {
  namespace: string;
  canManage: boolean;
  onDelete: (key: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<CacheKeyRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [inspected, setInspected] = useState<CacheKeyValue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const load = (reset: boolean) => {
    startTransition(async () => {
      const page = await browseCacheKeys(namespace, search.trim(), reset ? null : cursor);
      if (!page) {
        setError("Could not list keys.");
        return;
      }
      setError(null);
      setRows((current) => (reset ? page.keys : [...current, ...page.keys]));
      setCursor(page.cursor);
      setLoaded(true);
    });
  };

  const inspect = (key: string) => {
    startTransition(async () => {
      const value = await inspectCacheKey(namespace, key);
      if (!value) {
        setError("That key is no longer in the cache.");
        return;
      }
      setError(null);
      setInspected(value);
    });
  };

  // First open: fetch the first page without waiting for a click.
  useEffect(() => {
    startTransition(async () => {
      const page = await browseCacheKeys(namespace, "", null);
      if (!page) {
        setError("Could not list keys.");
        return;
      }
      setRows(page.keys);
      setCursor(page.cursor);
      setLoaded(true);
    });
  }, [namespace]);

  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          load(true);
        }}
      >
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search keys…"
          className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-fg placeholder:text-faint"
        />
        <button type="submit" className="btn-secondary text-xs" disabled={busy}>
          Search
        </button>
        <span className="text-xs text-faint">
          {rows.length} key{rows.length === 1 ? "" : "s"} shown{cursor ? " (more available)" : ""}
        </span>
      </form>

      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}

      {rows.length === 0 && loaded ? (
        <p className="text-xs text-muted">Nothing cached in this namespace right now.</p>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-left text-faint">
            <tr>
              <th className="py-1 pr-3 font-medium">Key</th>
              <th className="py-1 pr-3 text-right font-medium">TTL</th>
              <th className="py-1 pr-3 text-right font-medium">Size</th>
              <th className="py-1 text-right font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="py-1.5 pr-3 font-mono text-fg">{row.key}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-muted">
                  {row.ttlSeconds === null ? "—" : formatDuration(row.ttlSeconds * 1000)}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-muted">
                  {row.bytes === null ? "—" : formatBytes(row.bytes)}
                </td>
                <td className="py-1.5 text-right">
                  <div className="flex justify-end gap-2">
                    <button type="button" className="text-brand-blue hover:underline" onClick={() => inspect(row.key)}>
                      Inspect
                    </button>
                    {canManage ? (
                      <button
                        type="button"
                        className="text-red-600 hover:underline dark:text-red-400"
                        onClick={() => {
                          onDelete(row.key);
                          setRows((current) => current.filter((r) => r.key !== row.key));
                          if (inspected?.key === row.key) setInspected(null);
                        }}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {cursor ? (
        <button type="button" className="btn-secondary text-xs" disabled={busy} onClick={() => load(false)}>
          Load more
        </button>
      ) : null}

      {inspected ? (
        <div className="rounded-lg border border-line bg-surface p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-mono text-xs text-fg">
              {inspected.key}
              <span className="ml-2 text-faint">
                {inspected.ttlSeconds === null ? "" : `expires in ${formatDuration(inspected.ttlSeconds * 1000)}`}
              </span>
            </p>
            <button type="button" className="text-xs text-muted hover:underline" onClick={() => setInspected(null)}>
              Close
            </button>
          </div>
          <pre className="max-h-80 overflow-auto rounded bg-surface-3 p-3 font-mono text-[11px] leading-relaxed text-fg">
            {JSON.stringify(inspected.value, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

// ── Formatting ───────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)} h`;
  return `${Math.round(hours / 24)} d`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
