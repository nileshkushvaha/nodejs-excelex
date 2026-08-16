"use server";

import { revalidatePath } from "next/cache";

import { apiMutate, type ActionResult } from "@/lib/api";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export async function saveProduct(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const id = text(form, "id");
  const body = {
    code: text(form, "code"),
    name: text(form, "name"),
    productTypeId: text(form, "productTypeId") || null,
    productGroupId: text(form, "productGroupId") || null,
    service: text(form, "service") || null,
    contentKind: text(form, "contentKind") || "NDOX",
    // An unchecked checkbox submits nothing at all, so absence is false rather
    // than "unchanged" — which is what makes toggling one off actually save.
    fuelCharge: form.get("fuelCharge") === "on",
    gstReverse: form.get("gstReverse") === "on",
    isActive: form.get("isActive") === "on",
  };

  const result = id
    ? await apiMutate(`/api/v1/masters/products/${id}`, "PUT", body)
    : await apiMutate("/api/v1/masters/products", "POST", body);

  if (result.ok) revalidatePath("/products");
  return result;
}

export async function deleteProduct(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const result = await apiMutate(`/api/v1/masters/products/${text(form, "id")}`, "DELETE");
  if (result.ok) revalidatePath("/products");
  return result;
}
