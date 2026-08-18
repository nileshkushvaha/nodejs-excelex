"use server";

import { getUserLoginHistory, type UserLoginHistory } from "@/lib/api";

/**
 * The login screen's one follow-up read: a person's last fifty attempts and
 * their live sessions, for the side panel. A server action rather than a
 * browser fetch because the API cookie is server-side.
 *
 * Deliberately no mutations. Unlocking an account and revoking sessions
 * already live on the Users screen; this screen links there rather than
 * growing a second copy.
 */
export async function loadUserLoginHistory(userId: string): Promise<UserLoginHistory | null> {
  return getUserLoginHistory(userId);
}
