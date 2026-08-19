"use server";

import { getCmsMedia, getCmsMediaFolders, type CmsMediaFolder, type CmsMediaPage } from "@/lib/api";

/**
 * Reads the media picker and the library's drawer can make from the browser.
 *
 * Server actions rather than a route handler because the caller only wants
 * JSON with the session's cookie attached, and an action is the cheapest
 * way to get that: no URL to invent, no client-side fetch wrapper, and the
 * same `get` the pages use so a refused read is `null` here as it is there.
 */
export async function fetchMediaPage(query: {
  page?: number;
  pageSize?: number;
  search?: string;
  mimeType?: string;
  folder?: string;
}): Promise<CmsMediaPage | null> {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  if (query.search) params.set("search", query.search);
  if (query.mimeType) params.set("mimeType", query.mimeType);
  if (query.folder) params.set("folder", query.folder);
  return getCmsMedia(params.toString());
}

export async function fetchMediaFolders(): Promise<CmsMediaFolder[]> {
  return (await getCmsMediaFolders()) ?? [];
}
