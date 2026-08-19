"use server";

import { revalidatePath } from "next/cache";

import { apiMutate, type ActionResult, type CmsMenuItemInput } from "@/lib/api";

/**
 * A menu is saved whole: the API replaces the tree in one transaction, so a
 * reorder that moved three items and renamed one is one write, not four
 * that could half-land. Deleting a location empties it — the public site
 * then falls back to its static navigation.
 */
export async function saveMenu(location: string, name: string, items: CmsMenuItemInput[]): Promise<ActionResult> {
  const result = await apiMutate(`/api/v1/cms/menus/${encodeURIComponent(location)}`, "PUT", { name, items });
  if (result.ok) revalidatePath("/content/menus");
  return result;
}

export async function deleteMenu(location: string): Promise<ActionResult> {
  const result = await apiMutate(`/api/v1/cms/menus/${encodeURIComponent(location)}`, "DELETE");
  if (result.ok) revalidatePath("/content/menus");
  return result;
}
