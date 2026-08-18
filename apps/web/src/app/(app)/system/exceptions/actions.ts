"use server";

import { revalidatePath } from "next/cache";

import { apiMutate, getExceptionDetail, type ActionResult, type ExceptionDetail } from "@/lib/api";

export async function setExceptionStatus(fingerprint: string, verb: "resolve" | "ignore" | "reopen"): Promise<ActionResult> {
  const result = await apiMutate(`/api/v1/system/exceptions/${fingerprint}/${verb}`, "POST");
  if (result.ok) revalidatePath("/system/exceptions");
  return result;
}

export async function loadExceptionDetail(fingerprint: string): Promise<ExceptionDetail | null> {
  return getExceptionDetail(fingerprint);
}
