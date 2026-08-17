"use server";

import { revalidatePath } from "next/cache";

import { apiMutate, type ActionResult } from "@/lib/api";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export async function saveDestination(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const id = text(form, "id");
  const body = {
    kind: text(form, "kind") || "DOMESTIC",
    code: text(form, "code"),
    name: text(form, "name"),
    email: text(form, "email") || null,
    mobile: text(form, "mobile") || null,
    countryCode: text(form, "countryCode") || "IN",
    stateCode: text(form, "stateCode") || null,
    zoneId: text(form, "zoneId") || null,
    serviceType: text(form, "serviceType") || "REGULAR",
    mainBranchId: text(form, "mainBranchId") || null,
    manifestBranchId: text(form, "manifestBranchId") || null,
    isActive: form.get("isActive") === "on",
  };

  const result = id
    ? await apiMutate(`/api/v1/masters/destinations/${id}`, "PUT", body)
    : await apiMutate("/api/v1/masters/destinations", "POST", body);

  if (result.ok) revalidatePath("/network/destinations");
  return result;
}

export async function deleteDestination(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const result = await apiMutate(`/api/v1/masters/destinations/${text(form, "id")}`, "DELETE");
  if (result.ok) revalidatePath("/network/destinations");
  return result;
}
