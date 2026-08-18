"use server";

import { revalidatePath } from "next/cache";

import { apiMutate, type ActionResult } from "@/lib/api";

export async function revokeSession(id: string): Promise<ActionResult> {
  const result = await apiMutate(`/api/v1/system/sessions/${id}/revoke`, "POST");
  if (result.ok) revalidatePath("/users/active");
  return result;
}

export async function revokeAllSessions(userId: string): Promise<ActionResult> {
  const result = await apiMutate(`/api/v1/system/sessions/users/${userId}/revoke-all`, "POST");
  if (result.ok) revalidatePath("/users/active");
  return result;
}
