"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { apiMutate, type ActionResult } from "@/lib/api";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const number = (form: FormData, name: string) => Number(form.get(name) ?? 0) || 0;

export async function saveServiceCentre(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const id = text(form, "id");

  const body = {
    code: text(form, "code"),
    name: text(form, "name"),
    subName: text(form, "subName") || null,
    addressLine1: text(form, "addressLine1") || null,
    addressLine2: text(form, "addressLine2") || null,
    addressLine3: text(form, "addressLine3") || null,
    addressLine4: text(form, "addressLine4") || null,
    pinCode: text(form, "pinCode") || null,
    countryCode: text(form, "countryCode") || "IN",
    stateCode: text(form, "stateCode") || null,
    destinationId: text(form, "destinationId") || null,
    telephone: text(form, "telephone") || null,
    email: text(form, "email") || null,
    gstin: text(form, "gstin") || null,
    gstTelephone: text(form, "gstTelephone") || null,
    pan: text(form, "pan") || null,
    icnNo: text(form, "icnNo") || null,
    stNo: text(form, "stNo") || null,
    // Trailing blank lines are dropped rather than stored: ten empty strings on
    // every centre would print as ten blank lines on every invoice.
    terms: Array.from({ length: 10 }, (_, index) => text(form, `terms.${index}`)).filter(
      (line, index, all) => all.slice(index).some(Boolean),
    ),
    bankName: text(form, "bankName") || null,
    bankAccountNo: text(form, "bankAccountNo") || null,
    bankAccountName: text(form, "bankAccountName") || null,
    bankAddress: text(form, "bankAddress") || null,
    ifsc: text(form, "ifsc") || null,
    micr: text(form, "micr") || null,
    invoicePrefix: text(form, "invoicePrefix") || null,
    invoiceLastNo: number(form, "invoiceLastNo"),
    invoiceSuffix: text(form, "invoiceSuffix") || null,
    freeFormPrefix: text(form, "freeFormPrefix") || null,
    freeFormLastNo: number(form, "freeFormLastNo"),
    freeFormSuffix: text(form, "freeFormSuffix") || null,
    debitNotePrefix: text(form, "debitNotePrefix") || null,
    debitNoteLastNo: number(form, "debitNoteLastNo"),
    debitNoteSuffix: text(form, "debitNoteSuffix") || null,
    creditNotePrefix: text(form, "creditNotePrefix") || null,
    creditNoteLastNo: number(form, "creditNoteLastNo"),
    creditNoteSuffix: text(form, "creditNoteSuffix") || null,
    receiptLastNo: number(form, "receiptLastNo"),
    isActive: form.get("isActive") === "on",
  };

  const result = id
    ? await apiMutate(`/api/v1/masters/service-centres/${id}`, "PUT", body)
    : await apiMutate("/api/v1/masters/service-centres", "POST", body);

  if (!result.ok) return result;

  revalidatePath("/network/service-centres");
  // Outside any try/catch: redirect() signals by throwing, and swallowing it
  // would leave the user on a form that has already saved.
  redirect("/network/service-centres");
}

export async function deleteServiceCentre(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const result = await apiMutate(`/api/v1/masters/service-centres/${text(form, "id")}`, "DELETE");
  if (!result.ok) return result;

  revalidatePath("/network/service-centres");
  // Outside any try/catch: redirect() signals by throwing, and swallowing it
  // would leave the user on a form that has already saved.
  redirect("/network/service-centres");
}
