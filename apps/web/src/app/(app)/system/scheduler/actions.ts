"use server";

import { revalidatePath } from "next/cache";

import { apiMutate, getSchedule, type ActionResult, type ScheduleDetail } from "@/lib/api";

/**
 * The scheduler's mutations, and the one read the expanded row needs.
 *
 * The form is parsed here into the API's shape. Payload JSON is checked in
 * the browser before submit as well, but checked again here because a
 * server action is callable without the form.
 */
const PATH = "/system/scheduler";

const done = (result: ActionResult): ActionResult => {
  if (result.ok) revalidatePath(PATH);
  return result;
};

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export async function getScheduleDetail(id: string): Promise<ScheduleDetail | null> {
  return getSchedule(id);
}

export async function saveSchedule(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const id = text(form, "id");
  const raw = text(form, "payload");

  let payload: unknown = {};
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      return { ok: false, error: "Payload must be valid JSON." };
    }
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      return { ok: false, error: "Payload must be a JSON object." };
    }
  }

  const body = {
    name: text(form, "name"),
    description: text(form, "description") || null,
    jobName: text(form, "jobName"),
    queue: text(form, "queue") || "scheduled",
    cron: text(form, "cron"),
    timezone: text(form, "timezone") || "Asia/Kolkata",
    payload,
    isActive: form.get("isActive") === "on",
  };

  const result = id
    ? await apiMutate(`/api/v1/system/schedules/${encodeURIComponent(id)}`, "PUT", body)
    : await apiMutate("/api/v1/system/schedules", "POST", body);
  return done(result);
}

export async function deleteSchedule(id: string): Promise<ActionResult> {
  return done(await apiMutate(`/api/v1/system/schedules/${encodeURIComponent(id)}`, "DELETE"));
}

export async function runSchedule(id: string): Promise<ActionResult> {
  return done(await apiMutate(`/api/v1/system/schedules/${encodeURIComponent(id)}/run`, "POST"));
}

export async function setScheduleActive(id: string, active: boolean): Promise<ActionResult> {
  return done(
    await apiMutate(
      `/api/v1/system/schedules/${encodeURIComponent(id)}/${active ? "activate" : "deactivate"}`,
      "POST",
    ),
  );
}
