"use server";

import { revalidatePath } from "next/cache";

import { apiMutate, type ActionResult } from "@/lib/api";

export async function assignRole(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const userId = String(form.get("userId") ?? "");
  const branchId = String(form.get("branchId") ?? "");
  const expiresAt = String(form.get("expiresAt") ?? "");

  const result = await apiMutate(`/api/v1/access/users/${userId}/roles`, "POST", {
    roleId: String(form.get("roleId") ?? ""),
    // Empty means client-wide, which is a different assignment from any branch.
    branchId: branchId || null,
    expiresAt: expiresAt || null,
  });

  if (result.ok) revalidatePath(`/users/${userId}`);
  return result;
}

export async function unassignRole(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const userId = String(form.get("userId") ?? "");
  const roleId = String(form.get("roleId") ?? "");
  const branchId = String(form.get("branchId") ?? "");

  const result = await apiMutate(
    `/api/v1/access/users/${userId}/roles/${roleId}${branchId ? `?branchId=${branchId}` : ""}`,
    "DELETE",
  );

  if (result.ok) revalidatePath(`/users/${userId}`);
  return result;
}

export async function setDirectPermission(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const userId = String(form.get("userId") ?? "");
  const reason = String(form.get("reason") ?? "");
  const expiresAt = String(form.get("expiresAt") ?? "");

  const result = await apiMutate(`/api/v1/access/users/${userId}/permissions`, "PUT", {
    permission: String(form.get("permission") ?? ""),
    effect: String(form.get("effect") ?? "ALLOW"),
    reason: reason || null,
    expiresAt: expiresAt || null,
  });

  if (result.ok) revalidatePath(`/users/${userId}`);
  return result;
}

export async function clearDirectPermission(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const userId = String(form.get("userId") ?? "");
  const permission = String(form.get("permission") ?? "");

  const result = await apiMutate(
    `/api/v1/access/users/${userId}/permissions/${encodeURIComponent(permission)}`,
    "DELETE",
  );

  if (result.ok) revalidatePath(`/users/${userId}`);
  return result;
}
