"use server";

import { getActivityDetail, type ActivityDetail } from "@/lib/api";

/**
 * The one read the activity screen makes after it has loaded: the full row,
 * metadata included, for the event somebody clicked. Routed through an action
 * because the API cookie lives on the server, and the browser never talks to
 * the API directly.
 *
 * There are no mutations here, and there never will be — the trail is
 * append-only and this screen only reads it.
 */
export async function loadActivityDetail(id: string): Promise<ActivityDetail | null> {
  return getActivityDetail(id);
}
