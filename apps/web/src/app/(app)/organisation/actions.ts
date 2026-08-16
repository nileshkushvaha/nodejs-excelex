"use server";

import { revalidatePath } from "next/cache";

import { apiMutate, type ActionResult } from "@/lib/api";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

function departmentBody(form: FormData) {
  return {
    code: text(form, "code"),
    name: text(form, "name"),
    description: text(form, "description") || null,
    isActive: form.get("isActive") === "on",
  };
}

export async function saveDepartment(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const id = text(form, "id");
  const result = id
    ? await apiMutate(`/api/v1/masters/departments/${id}`, "PUT", departmentBody(form))
    : await apiMutate("/api/v1/masters/departments", "POST", departmentBody(form));

  if (result.ok) {
    revalidatePath("/organisation/departments");
    // Designations show their department, so a rename has to reach that page too.
    revalidatePath("/organisation/designations");
  }
  return result;
}

export async function deleteDepartment(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const result = await apiMutate(`/api/v1/masters/departments/${text(form, "id")}`, "DELETE");
  if (result.ok) revalidatePath("/organisation/departments");
  return result;
}

export async function saveDesignation(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const id = text(form, "id");
  const body = {
    ...departmentBody(form),
    departmentId: text(form, "departmentId") || null,
    level: Number(form.get("level") ?? 0),
  };

  const result = id
    ? await apiMutate(`/api/v1/masters/designations/${id}`, "PUT", body)
    : await apiMutate("/api/v1/masters/designations", "POST", body);

  if (result.ok) revalidatePath("/organisation/designations");
  return result;
}

export async function deleteDesignation(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const result = await apiMutate(`/api/v1/masters/designations/${text(form, "id")}`, "DELETE");
  if (result.ok) revalidatePath("/organisation/designations");
  return result;
}
