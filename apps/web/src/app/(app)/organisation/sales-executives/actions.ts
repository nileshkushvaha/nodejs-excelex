"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { apiMutate, type ActionResult } from "@/lib/api";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export async function saveSalesExecutive(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const id = text(form, "id");
  const body = {
    code: text(form, "code"),
    name: text(form, "name"),
    // Sent as typed, not parsed to a number: the value is exact decimal all the
    // way to the column, and Number() here would be the one place it stopped
    // being exact.
    commissionPercent: text(form, "commissionPercent") || "0",
    email: text(form, "email") || null,
    mobile: text(form, "mobile") || null,
    isActive: form.get("isActive") === "on",
  };

  const result = id
    ? await apiMutate(`/api/v1/masters/sales-executives/${id}`, "PUT", body)
    : await apiMutate("/api/v1/masters/sales-executives", "POST", body);

  if (!result.ok) return result;

  revalidatePath("/organisation/sales-executives");
  redirect("/organisation/sales-executives");
}

export async function deleteSalesExecutive(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const result = await apiMutate(
    `/api/v1/masters/sales-executives/${text(form, "id")}`,
    "DELETE",
  );
  if (result.ok) revalidatePath("/organisation/sales-executives");
  return result;
}
