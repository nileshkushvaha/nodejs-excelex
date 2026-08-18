"use server";

import { revalidatePath } from "next/cache";

import { apiMutate, type ActionResult } from "@/lib/api";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

/**
 * One pair of actions for all six lists.
 *
 * The kind travels in the form rather than being captured per screen, so
 * adding a list is a registry entry and nothing else.
 */
export async function saveLookup(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const kind = text(form, "kind");
  const id = text(form, "id");
  const body = {
    code: text(form, "code"),
    name: text(form, "name"),
    description: text(form, "description") || null,
    sequence: Number(text(form, "sequence") || 0),
    isActive: form.get("isActive") === "on",
  };

  const result = id
    ? await apiMutate(`/api/v1/masters/lookups/${kind}/${id}`, "PUT", body)
    : await apiMutate(`/api/v1/masters/lookups/${kind}`, "POST", body);

  if (result.ok) revalidatePath(`/lookups/${kind}`);
  return result;
}

export async function deleteLookup(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const kind = text(form, "kind");
  const result = await apiMutate(`/api/v1/masters/lookups/${kind}/${text(form, "id")}`, "DELETE");

  if (result.ok) revalidatePath(`/lookups/${kind}`);
  return result;
}
