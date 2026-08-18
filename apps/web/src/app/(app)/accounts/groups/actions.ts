"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { apiMutate, type ActionResult } from "@/lib/api";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export async function saveAccountGroup(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const id = text(form, "id");
  const body = {
    code: text(form, "code"),
    name: text(form, "name"),
    parentId: text(form, "parentId") || null,
    isActive: form.get("isActive") === "on",
  };

  const result = id
    ? await apiMutate(`/api/v1/masters/account-groups/${id}`, "PUT", body)
    : await apiMutate("/api/v1/masters/account-groups", "POST", body);

  if (!result.ok) return result;

  revalidatePath("/accounts/groups");
  // Outside any try/catch: redirect() signals by throwing, and swallowing it
  // would leave the user on a form that has already saved.
  redirect("/accounts/groups");
}

export async function deleteAccountGroup(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const result = await apiMutate(`/api/v1/masters/account-groups/${text(form, "id")}`, "DELETE");
  if (!result.ok) return result;

  revalidatePath("/accounts/groups");
  return { ok: true };
}
