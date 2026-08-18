"use server";

import { revalidatePath } from "next/cache";

import { apiMutate, type ActionResult } from "@/lib/api";

export async function deleteRate(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const id = String(form.get("id") ?? "").trim();
  const result = await apiMutate(`/api/v1/masters/rates/${id}`, "DELETE");

  if (result.ok) revalidatePath("/rates");
  return result;
}
