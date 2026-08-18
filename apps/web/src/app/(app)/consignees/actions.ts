"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { apiMutate, type ActionResult } from "@/lib/api";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const nullable = (form: FormData, name: string) => text(form, name) || null;

export async function saveConsignee(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const id = text(form, "id");
  const body = {
    code: text(form, "code"),
    name: text(form, "name"),
    destinationId: nullable(form, "destinationId"),
    serviceCentreId: nullable(form, "serviceCentreId"),
    contactPerson: nullable(form, "contactPerson"),
    addressLine1: nullable(form, "addressLine1"),
    addressLine2: nullable(form, "addressLine2"),
    pinCode: nullable(form, "pinCode"),
    city: nullable(form, "city"),
    stateCode: nullable(form, "stateCode"),
    countryCode: text(form, "countryCode") || "IN",
    telephone1: nullable(form, "telephone1"),
    telephone2: nullable(form, "telephone2"),
    fax: nullable(form, "fax"),
    email: nullable(form, "email"),
    mobile: nullable(form, "mobile"),
    industry: nullable(form, "industry"),
    eori: nullable(form, "eori"),
    vat: nullable(form, "vat"),
    isActive: form.get("isActive") === "on",
  };

  const result = id
    ? await apiMutate(`/api/v1/masters/consignees/${id}`, "PUT", body)
    : await apiMutate("/api/v1/masters/consignees", "POST", body);

  if (!result.ok) return result;

  revalidatePath("/consignees");
  // Outside any try/catch: redirect() signals by throwing, and swallowing it
  // would leave the user on a form that has already saved.
  redirect("/consignees");
}

export async function deleteConsignee(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const result = await apiMutate(`/api/v1/masters/consignees/${text(form, "id")}`, "DELETE");
  if (!result.ok) return result;

  revalidatePath("/consignees");
  return { ok: true };
}
