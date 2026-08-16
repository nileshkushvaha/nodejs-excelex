"use server";

import { revalidatePath } from "next/cache";

import { apiMutate, type ActionResult } from "@/lib/api";

export async function updateProfile(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const result = await apiMutate("/api/v1/profile", "PATCH", {
    fullName: String(form.get("fullName") ?? ""),
  });

  if (result.ok) revalidatePath("/profile");
  return result;
}

export async function changePassword(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const newPassword = String(form.get("newPassword") ?? "");

  // Checked here as well as by the API, only so the mismatch is caught before a
  // round trip. The API remains the authority on every other rule.
  if (newPassword !== String(form.get("confirmPassword") ?? "")) {
    return { ok: false, error: "The two new passwords do not match." };
  }

  const result = await apiMutate("/api/v1/profile/password", "POST", {
    currentPassword: String(form.get("currentPassword") ?? ""),
    newPassword,
  });

  if (result.ok) revalidatePath("/profile");
  return result;
}

export async function revokeOtherSessions(): Promise<ActionResult> {
  const result = await apiMutate("/api/v1/profile/sessions", "DELETE");
  if (result.ok) revalidatePath("/profile");
  return result;
}
