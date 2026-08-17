"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { apiMutate, type ActionResult } from "@/lib/api";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export async function saveProductType(
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
    ? await apiMutate(`/api/v1/masters/product-types/${id}`, "PUT", body)
    : await apiMutate("/api/v1/masters/product-types", "POST", body);

  if (!result.ok) return result;

  revalidatePath("/products/types");
  // Products name their type, so a rename shows there too.
  revalidatePath("/products");
  // Outside any try/catch: redirect() signals by throwing, and swallowing it
  // would leave the user on a form that has already saved.
  redirect("/products/types");
}

export async function deleteProductType(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const result = await apiMutate(`/api/v1/masters/product-types/${text(form, "id")}`, "DELETE");
  if (!result.ok) return result;

  revalidatePath("/products/types");
  revalidatePath("/products");
  return { ok: true };
}
