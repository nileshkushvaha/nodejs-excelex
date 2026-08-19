"use server";

import type { ActionResult } from "@/lib/api";
import {
  bulkContent,
  destroyContent,
  publishContent,
  transitionContent,
  trashContent,
} from "../content-actions";

/**
 * The pages list's actions: the shared content actions with the collection
 * bound. Kept as its own file so the list component imports "./actions" like
 * every other list, and so a reader looking for "what can this screen do"
 * finds a short answer here.
 */
const collection = "pages" as const;

export async function publish(id: string, at?: string | null): Promise<ActionResult> {
  return publishContent(collection, id, at);
}
export async function unpublish(id: string): Promise<ActionResult> {
  return transitionContent(collection, id, "unpublish");
}
export async function archive(id: string): Promise<ActionResult> {
  return transitionContent(collection, id, "archive");
}
export async function restore(id: string): Promise<ActionResult> {
  return transitionContent(collection, id, "restore");
}
export async function duplicate(id: string): Promise<ActionResult> {
  return transitionContent(collection, id, "duplicate");
}
export async function trash(id: string): Promise<ActionResult> {
  return trashContent(collection, id);
}
export async function destroy(id: string): Promise<ActionResult> {
  return destroyContent(collection, id);
}
export async function bulk(ids: string[], verb: "trash" | "publish" | "restore"): Promise<ActionResult> {
  return bulkContent(collection, ids, verb);
}
