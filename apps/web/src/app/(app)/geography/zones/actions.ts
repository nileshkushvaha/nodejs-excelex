"use server";

import { revalidatePath } from "next/cache";

import { apiMutate, type ActionResult } from "@/lib/api";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export async function saveZone(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const id = text(form, "id");
  const body = {
    code: text(form, "code"),
    name: text(form, "name"),
    isActive: form.get("isActive") === "on",
  };

  const result = id
    ? await apiMutate(`/api/v1/masters/zones/${id}`, "PUT", body)
    : await apiMutate("/api/v1/masters/zones", "POST", body);

  if (result.ok) revalidatePath("/geography/zones");
  return result;
}

export async function deleteZone(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const result = await apiMutate(`/api/v1/masters/zones/${text(form, "id")}`, "DELETE");
  if (result.ok) revalidatePath("/geography/zones");
  return result;
}
