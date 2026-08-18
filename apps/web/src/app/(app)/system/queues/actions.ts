"use server";

import { revalidatePath } from "next/cache";

import { apiMutate, getJob, type ActionResult, type JobDetail } from "@/lib/api";

/**
 * The queue monitor's mutations, and the one read the detail panel needs.
 *
 * The read is a server action rather than a client-side fetch for the same
 * reason every other read here goes through the server: the API cookie is
 * server-side, and there is one data path. Everything else revalidates the
 * page so the live tiles and the table move together.
 */
const PATH = "/system/queues";

const done = (result: ActionResult): ActionResult => {
  if (result.ok) revalidatePath(PATH);
  return result;
};

export async function getJobDetail(id: string): Promise<JobDetail | null> {
  return getJob(id);
}

export async function retryJob(id: string): Promise<ActionResult> {
  return done(await apiMutate(`/api/v1/system/jobs/${encodeURIComponent(id)}/retry`, "POST"));
}

export async function cancelJob(id: string): Promise<ActionResult> {
  return done(await apiMutate(`/api/v1/system/jobs/${encodeURIComponent(id)}/cancel`, "POST"));
}

export async function pauseQueue(name: string): Promise<ActionResult> {
  return done(await apiMutate(`/api/v1/system/queues/${encodeURIComponent(name)}/pause`, "POST"));
}

export async function resumeQueue(name: string): Promise<ActionResult> {
  return done(await apiMutate(`/api/v1/system/queues/${encodeURIComponent(name)}/resume`, "POST"));
}

export async function cleanQueue(
  name: string,
  state: "completed" | "failed",
  olderThanMinutes: number,
): Promise<ActionResult> {
  return done(
    await apiMutate(`/api/v1/system/queues/${encodeURIComponent(name)}/clean`, "POST", {
      state,
      olderThanMinutes,
    }),
  );
}

export async function runJob(
  _previous: ActionResult | null,
  form: FormData,
): Promise<ActionResult> {
  const name = String(form.get("name") ?? "");
  const queue = String(form.get("queue") ?? "default");
  const raw = String(form.get("payload") ?? "").trim();

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

  return done(await apiMutate("/api/v1/system/jobs", "POST", { name, queue, payload }));
}
