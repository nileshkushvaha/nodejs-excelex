"use server";

import { revalidatePath } from "next/cache";

import {
  apiMutate,
  getCmsRevision,
  getCmsRevisions,
  getCmsPreviewToken,
  type ActionResult,
  type CmsCollection,
  type CmsContentInput,
} from "@/lib/api";

/**
 * Every mutation a page or a post can undergo, parameterised by collection.
 *
 * Pages and posts are one table behind one service with two route prefixes,
 * and the admin screens for them differ in a sidebar card or two. Writing the
 * actions once, with the collection as the first argument, keeps the two
 * folders' `actions.ts` files to thin bindings and means a fix to "publish"
 * lands in both places at once. The editor — a shared component — calls
 * these directly with the collection it was given.
 *
 * Reads that a client component needs on demand (revisions, a preview
 * token) live here too: `get` reads cookies, so it only runs on the server,
 * and a server action is the sanctioned way for the browser to ask.
 */
const base = (collection: CmsCollection) => `/api/v1/cms/${collection}`;
const listPath = (collection: CmsCollection) => `/content/${collection}`;

function refresh(collection: CmsCollection, id?: string) {
  revalidatePath(listPath(collection));
  revalidatePath("/content");
  if (id) revalidatePath(`${listPath(collection)}/${id}`);
}

export async function saveContent(
  collection: CmsCollection,
  id: string | null,
  body: CmsContentInput,
): Promise<ActionResult> {
  const result = id
    ? await apiMutate(`${base(collection)}/${id}`, "PUT", body)
    : await apiMutate(base(collection), "POST", body);
  if (result.ok) refresh(collection, id ?? undefined);
  return result;
}

export async function publishContent(
  collection: CmsCollection,
  id: string,
  at?: string | null,
): Promise<ActionResult> {
  const result = await apiMutate(`${base(collection)}/${id}/publish`, "POST", at ? { at } : {});
  if (result.ok) refresh(collection, id);
  return result;
}

export async function transitionContent(
  collection: CmsCollection,
  id: string,
  verb: "unpublish" | "archive" | "restore" | "duplicate",
): Promise<ActionResult> {
  const result = await apiMutate(`${base(collection)}/${id}/${verb}`, "POST");
  if (result.ok) refresh(collection, id);
  return result;
}

export async function trashContent(collection: CmsCollection, id: string): Promise<ActionResult> {
  const result = await apiMutate(`${base(collection)}/${id}`, "DELETE");
  if (result.ok) refresh(collection, id);
  return result;
}

export async function destroyContent(collection: CmsCollection, id: string): Promise<ActionResult> {
  const result = await apiMutate(`${base(collection)}/${id}/permanent`, "DELETE");
  if (result.ok) refresh(collection, id);
  return result;
}

/**
 * Bulk operations run one request per row rather than through a bulk
 * endpoint the contract does not have; the first failure is reported and the
 * rest are still attempted, so a permission problem on one row does not
 * leave the others half-done.
 */
export async function bulkContent(
  collection: CmsCollection,
  ids: string[],
  verb: "trash" | "publish" | "restore",
): Promise<ActionResult> {
  let firstError: ActionResult | null = null;
  for (const id of ids) {
    const result =
      verb === "trash"
        ? await apiMutate(`${base(collection)}/${id}`, "DELETE")
        : verb === "publish"
          ? await apiMutate(`${base(collection)}/${id}/publish`, "POST", {})
          : await apiMutate(`${base(collection)}/${id}/restore`, "POST");
    if (!result.ok && !firstError) firstError = result;
  }
  refresh(collection);
  return firstError ?? { ok: true };
}

export async function listRevisions(collection: CmsCollection, id: string) {
  return (await getCmsRevisions(collection, id)) ?? [];
}

export async function readRevision(collection: CmsCollection, id: string, revisionId: string) {
  return getCmsRevision(collection, id, revisionId);
}

export async function restoreRevision(
  collection: CmsCollection,
  id: string,
  revisionId: string,
): Promise<ActionResult> {
  const result = await apiMutate(`${base(collection)}/${id}/revisions/${revisionId}/restore`, "POST");
  if (result.ok) refresh(collection, id);
  return result;
}

export async function previewToken(collection: CmsCollection, id: string) {
  return getCmsPreviewToken(collection, id);
}
