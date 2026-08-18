"use server";

import { revalidatePath } from "next/cache";

import { apiMutate, type ActionResult } from "@/lib/api";

export async function markNotificationsRead(ids?: string[]): Promise<ActionResult> {
  const result = await apiMutate("/api/v1/notifications/read", "POST", ids ? { ids } : {});
  if (result.ok) revalidatePath("/notifications");
  return result;
}
