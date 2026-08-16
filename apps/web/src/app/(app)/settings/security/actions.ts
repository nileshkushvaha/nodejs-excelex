"use server";

import { revalidatePath } from "next/cache";

import { apiMutate, type ActionResult } from "@/lib/api";

const toggle = (form: FormData, name: string) => form.get(name) === "on";
const number = (form: FormData, name: string) => Number(form.get(name) ?? 0);

export async function savePasswordPolicy(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const result = await apiMutate("/api/v1/settings/password-policy", "PUT", {
    minLength: number(form, "minLength"),
    requireUppercase: toggle(form, "requireUppercase"),
    requireLowercase: toggle(form, "requireLowercase"),
    requireNumber: toggle(form, "requireNumber"),
    requireSpecial: toggle(form, "requireSpecial"),
    preventReuse: toggle(form, "preventReuse"),
    historyCount: number(form, "historyCount"),
    expiryEnabled: toggle(form, "expiryEnabled"),
    expiryDays: number(form, "expiryDays"),
    forceChangeOnFirstLogin: toggle(form, "forceChangeOnFirstLogin"),
  });

  if (result.ok) {
    revalidatePath("/settings/security");
    // The profile screen shows the live checklist derived from this policy.
    revalidatePath("/profile");
  }
  return result;
}
