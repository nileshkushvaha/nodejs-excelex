"use server";

import { revalidatePath } from "next/cache";

import {
  apiMutate,
  getCacheKey,
  getCacheKeys,
  type ActionResult,
  type CacheKeyPage,
  type CacheKeyValue,
} from "@/lib/api";

/**
 * The cache manager's mutations, plus two reads.
 *
 * The reads are here because the key browser is interactive — search, load
 * more, inspect — and the API cookie lives on the server. Routing them
 * through actions keeps one data path rather than teaching the browser to
 * call the API directly.
 */
const PATH = "/system/cache";

const done = (result: ActionResult): ActionResult => {
  if (result.ok) revalidatePath(PATH);
  return result;
};

export async function flushNamespace(namespace: string): Promise<ActionResult> {
  return done(await apiMutate(`/api/v1/system/cache/${encodeURIComponent(namespace)}`, "DELETE"));
}

export async function flushAllNamespaces(): Promise<ActionResult> {
  return done(await apiMutate("/api/v1/system/cache/flush", "POST"));
}

export async function flushPlatformNamespace(namespace: string): Promise<ActionResult> {
  return done(
    await apiMutate(`/api/v1/system/cache/platform/${encodeURIComponent(namespace)}/flush`, "POST"),
  );
}

export async function deleteCacheKey(namespace: string, key: string): Promise<ActionResult> {
  return done(
    await apiMutate(
      `/api/v1/system/cache/${encodeURIComponent(namespace)}/keys/${encodeURIComponent(key)}`,
      "DELETE",
    ),
  );
}

export async function resetCacheStats(): Promise<ActionResult> {
  return done(await apiMutate("/api/v1/system/cache/stats/reset", "POST"));
}

export async function browseCacheKeys(
  namespace: string,
  search: string,
  cursor: string | null,
): Promise<CacheKeyPage | null> {
  const query = new URLSearchParams();
  if (search) query.set("search", search);
  if (cursor) query.set("cursor", cursor);
  return getCacheKeys(namespace, query.toString());
}

export async function inspectCacheKey(
  namespace: string,
  key: string,
): Promise<CacheKeyValue | null> {
  return getCacheKey(namespace, key);
}
