"use server";

import { revalidatePath } from "next/cache";

import { apiMutate, type ActionResult } from "@/lib/api";

/**
 * The library's mutations. Uploads are not here — they go through the
 * /api/cms/upload route handler so the browser can show progress — but
 * everything that edits or removes a row is a server action like the rest
 * of the app, so a refused change carries the API's own sentence back.
 */
export async function updateMedia(
  id: string,
  patch: { title?: string | null; altText?: string | null; caption?: string | null; folder?: string | null },
): Promise<ActionResult> {
  const result = await apiMutate(`/api/v1/cms/media/${id}`, "PUT", patch);
  if (result.ok) revalidatePath("/content/media");
  return result;
}

export async function trashMedia(id: string): Promise<ActionResult> {
  const result = await apiMutate(`/api/v1/cms/media/${id}`, "DELETE");
  if (result.ok) revalidatePath("/content/media");
  return result;
}

export async function purgeMedia(id: string): Promise<ActionResult> {
  const result = await apiMutate(`/api/v1/cms/media/${id}/permanent`, "DELETE");
  if (result.ok) revalidatePath("/content/media");
  return result;
}

export async function refreshMediaLibrary(): Promise<void> {
  revalidatePath("/content/media");
}
