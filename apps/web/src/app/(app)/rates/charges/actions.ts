"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { apiMutate, type ActionResult } from "@/lib/api";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const flag = (form: FormData, name: string) => form.get(name) === "on";

export async function saveCharge(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const id = text(form, "id");
  const body = {
    code: text(form, "code"),
    name: text(form, "name"),
    chargeType: text(form, "chargeType"),
    calculationBase: text(form, "calculationBase"),
    // Sent as typed, never through a number: the column is exact decimal.
    rate: text(form, "rate") || "0",
    applyFuel: flag(form, "applyFuel"),
    applyTaxOnFuel: flag(form, "applyTaxOnFuel"),
    applyTax: flag(form, "applyTax"),
    hsnCode: text(form, "hsnCode") || null,
    sequence: Number(text(form, "sequence") || 0),
    applyFuelOnComponents: flag(form, "applyFuelOnComponents"),
    isActive: flag(form, "isActive"),
    // The full checklist, so anything unticked is absent rather than implied.
    componentIds: form.getAll("componentIds").map(String),
  };

  const result = id
    ? await apiMutate(`/api/v1/masters/charges/${id}`, "PUT", body)
    : await apiMutate("/api/v1/masters/charges", "POST", body);

  if (!result.ok) return result;

  revalidatePath("/rates/charges");
  // Outside any try/catch: redirect() signals by throwing, and swallowing it
  // would leave the user on a form that has already saved.
  redirect("/rates/charges");
}

export async function deleteCharge(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const result = await apiMutate(`/api/v1/masters/charges/${text(form, "id")}`, "DELETE");
  if (!result.ok) return result;

  revalidatePath("/rates/charges");
  return { ok: true };
}
