"use server";

import { revalidatePath } from "next/cache";

import { apiMutate, type ActionResult } from "@/lib/api";

const text = (form: FormData, name: string) => {
  const value = String(form.get(name) ?? "").trim();
  return value.length ? value : null;
};

export async function saveMailSettings(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  const provider = String(form.get("provider") ?? "PLATFORM") === "SMTP" ? "SMTP" : "PLATFORM";
  const result = await apiMutate("/api/v1/settings/mail", "PUT", {
    provider,
    smtpHost: text(form, "smtpHost"),
    smtpPort: text(form, "smtpPort"),
    smtpSecure: form.get("smtpSecure") === "on",
    smtpUsername: text(form, "smtpUsername"),
    // Empty keeps the stored password; the API treats it that way.
    smtpPassword: String(form.get("smtpPassword") ?? ""),
    fromName: text(form, "fromName"),
    fromEmail: text(form, "fromEmail"),
    replyTo: text(form, "replyTo"),
  });
  if (result.ok) revalidatePath("/settings/mail");
  return result;
}

export async function sendTestMail(): Promise<ActionResult> {
  const result = await apiMutate("/api/v1/settings/mail/test", "POST");
  revalidatePath("/settings/mail");
  if (result.ok) {
    const data = result.data as { ok: boolean; to: string; error?: string };
    return data.ok
      ? { ok: true, data }
      : { ok: false, error: `The mail server refused: ${data.error ?? "unknown error"}`, data };
  }
  return result;
}
