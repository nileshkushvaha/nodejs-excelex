"use server";

import { revalidatePath } from "next/cache";

import { apiMutate, type ActionResult } from "@/lib/api";

/**
 * Server actions, not client fetches.
 *
 * The mutation runs on the server, forwarding the session cookie, and the
 * authorization answer comes from the API exactly as it would for any other
 * caller. Nothing here decides what is allowed — it only carries the request and
 * reports what the API said.
 */

export async function createRole(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  const result = await apiMutate("/api/v1/access/roles", "POST", {
    name: String(form.get("name") ?? ""),
    description: String(form.get("description") ?? "") || null,
    permissions: form.getAll("permissions").map(String),
  });

  if (result.ok) revalidatePath("/roles");
  return result;
}

export async function setRolePermissions(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const roleId = String(form.get("roleId") ?? "");
  const result = await apiMutate(`/api/v1/access/roles/${roleId}/permissions`, "PUT", {
    permissions: form.getAll("permissions").map(String),
  });

  if (result.ok) revalidatePath("/roles");
  return result;
}

export async function deleteRole(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const result = await apiMutate(`/api/v1/access/roles/${String(form.get("roleId") ?? "")}`, "DELETE");
  if (result.ok) revalidatePath("/roles");
  return result;
}
