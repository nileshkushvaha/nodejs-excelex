"use server";

import { revalidatePath } from "next/cache";

import { apiMutate, type ActionResult } from "@/lib/api";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export async function saveGeneralSettings(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const result = await apiMutate("/api/v1/settings/general", "PUT", {
    legalName: text(form, "legalName"),
    tradingName: text(form, "tradingName"),
    gstin: text(form, "gstin"),
    pan: text(form, "pan"),
    cin: text(form, "cin"),
    supportEmail: text(form, "supportEmail"),
    supportPhone: text(form, "supportPhone"),
    websiteUrl: text(form, "websiteUrl"),
    addressLine1: text(form, "addressLine1"),
    addressLine2: text(form, "addressLine2"),
    city: text(form, "city"),
    stateCode: text(form, "stateCode"),
    countryCode: text(form, "countryCode") || "IN",
    postalCode: text(form, "postalCode"),
    timezone: text(form, "timezone"),
    currency: text(form, "currency"),
    dateFormat: text(form, "dateFormat"),
    weekStart: Number(form.get("weekStart") ?? 1),
    invoicePrefix: text(form, "invoicePrefix"),
    invoiceFooter: text(form, "invoiceFooter"),
    termsText: text(form, "termsText"),
  });

  if (result.ok) revalidatePath("/settings/general");
  return result;
}
