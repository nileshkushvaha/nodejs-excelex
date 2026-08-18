"use server";

import { revalidatePath } from "next/cache";

import { apiMutate, type ActionResult } from "@/lib/api";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const nullable = (form: FormData, name: string) => text(form, name) || null;

export async function savePinCode(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const id = text(form, "id");
  const body = {
    code: text(form, "code"),
    city: nullable(form, "city"),
    area: nullable(form, "area"),
    stateCode: nullable(form, "stateCode"),
    countryCode: text(form, "countryCode") || "IN",
    destinationId: nullable(form, "destinationId"),
    zoneId: nullable(form, "zoneId"),
    oda: form.get("oda") === "on",
    isActive: form.get("isActive") === "on",
  };

  const result = id
    ? await apiMutate(`/api/v1/masters/pin-codes/${id}`, "PUT", body)
    : await apiMutate("/api/v1/masters/pin-codes", "POST", body);

  if (result.ok) revalidatePath("/network/pincodes");
  return result;
}

export async function deletePinCode(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const result = await apiMutate(`/api/v1/masters/pin-codes/${text(form, "id")}`, "DELETE");
  if (result.ok) revalidatePath("/network/pincodes");
  return result;
}
