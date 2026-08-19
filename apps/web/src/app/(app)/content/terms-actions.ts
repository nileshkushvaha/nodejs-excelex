"use server";

import { revalidatePath } from "next/cache";

import { apiMutate, getCmsTerms, type ActionResult, type CmsTaxonomy, type CmsTerm } from "@/lib/api";

/**
 * Categories and tags share a table, a route and a set of verbs; the two
 * admin pages and the post editor's sidebar all reach the same four actions
 * here. Each revalidates both term pages and the post list, because a rename
 * shows up in a post's category column as much as in the term table.
 */
export interface TermInput {
  taxonomy: CmsTaxonomy;
  name: string;
  slug?: string | null;
  description?: string | null;
  parentId?: string | null;
}

function refresh() {
  revalidatePath("/content/categories");
  revalidatePath("/content/tags");
  revalidatePath("/content/posts");
}

export async function createTerm(input: TermInput): Promise<ActionResult> {
  const result = await apiMutate("/api/v1/cms/terms", "POST", input);
  if (result.ok) refresh();
  return result;
}

export async function updateTerm(id: string, input: TermInput): Promise<ActionResult> {
  const result = await apiMutate(`/api/v1/cms/terms/${id}`, "PUT", input);
  if (result.ok) refresh();
  return result;
}

export async function deleteTerm(id: string): Promise<ActionResult> {
  const result = await apiMutate(`/api/v1/cms/terms/${id}`, "DELETE");
  if (result.ok) refresh();
  return result;
}

export async function mergeTerm(id: string, intoId: string): Promise<ActionResult> {
  const result = await apiMutate(`/api/v1/cms/terms/${id}/merge`, "POST", { intoId });
  if (result.ok) refresh();
  return result;
}

/** For the tag token input's suggestions, typed against the API as you go. */
export async function searchTerms(taxonomy: CmsTaxonomy, search: string): Promise<CmsTerm[]> {
  const query = new URLSearchParams({ taxonomy });
  if (search) query.set("search", search);
  return (await getCmsTerms(query.toString())) ?? [];
}
