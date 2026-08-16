"use server";

import { revalidatePath } from "next/cache";

import { apiMutate, getSecuritySettings, type ActionResult } from "@/lib/api";

const toggle = (form: FormData, name: string) => form.get(name) === "on";
const number = (form: FormData, name: string) => Number(form.get(name) ?? 0);

/**
 * Login and session settings share one row, so a partial save would silently
 * revert whatever the other page last set. Each page submits its own fields and
 * merges them over the current stored values.
 */
async function saveMerged(fields: Record<string, unknown>): Promise<ActionResult> {
  const current = await getSecuritySettings();
  if (!current) return { ok: false, error: "Could not read the current settings." };

  const { updatedAt: _ignored, ...rest } = current;
  const result = await apiMutate("/api/v1/settings/security", "PUT", { ...rest, ...fields });

  if (result.ok) {
    revalidatePath("/settings/login");
    revalidatePath("/settings/sessions");
  }
  return result;
}

export async function saveLoginSecurity(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  return saveMerged({
    lockAfterFailedAttempts: toggle(form, "lockAfterFailedAttempts"),
    maxFailedAttempts: number(form, "maxFailedAttempts"),
    lockoutMinutes: number(form, "lockoutMinutes"),
    loginThrottleEnabled: toggle(form, "loginThrottleEnabled"),
    resetThrottleEnabled: toggle(form, "resetThrottleEnabled"),
    notifyUserOnFailedAttempts: toggle(form, "notifyUserOnFailedAttempts"),
    notifyUserOnLock: toggle(form, "notifyUserOnLock"),
    notifyAdminOnLock: toggle(form, "notifyAdminOnLock"),
  });
}

export async function saveSessionSettings(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  return saveMerged({
    idleTimeoutMinutes: number(form, "idleTimeoutMinutes"),
    absoluteTimeoutHours: number(form, "absoluteTimeoutHours"),
    allowMultipleSessions: toggle(form, "allowMultipleSessions"),
    forceLogoutOnPasswordChange: toggle(form, "forceLogoutOnPasswordChange"),
  });
}
