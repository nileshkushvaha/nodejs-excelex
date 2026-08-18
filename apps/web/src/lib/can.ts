import { permissionFor, type Action, type Resource } from "@excelex/permissions";

import type { CurrentSession } from "./api";

/**
 * The Gate, in the browser.
 *
 * Deliberately the same policy table the API uses. Before this, pages tested
 * `can(session, "customer", "update")` — a string
 * typed by hand in each page, next to a route that had typed its own copy. A
 * typo hid a button that the API would have allowed, or showed one it would
 * refuse; both look like bugs in the permission system rather than in the
 * spelling.
 *
 * This is presentation, not enforcement. Hiding a button is a courtesy to the
 * person using the screen; the answer that matters is the one the API gives,
 * and it asks the same table.
 */
export function can(
  session: CurrentSession | null | undefined,
  resource: Resource,
  action: Action,
): boolean {
  if (!session) return false;

  const required = permissionFor(resource, action);
  return session.user.permissions.some((granted) => matches(granted, required));
}

export function cannot(
  session: CurrentSession | null | undefined,
  resource: Resource,
  action: Action,
): boolean {
  return !can(session, resource, action);
}

/**
 * Wildcard matching, in the shape the resolver uses.
 *
 * The session carries permissions already resolved by the API — DENY applied,
 * expiry checked — so this only has to expand wildcards. Matching on
 * dot-separated segments rather than substrings, so `masters.custom*` matches
 * nothing: a prefix that stops mid-segment is a typo, and reading it as a
 * match would quietly show more than the person holds.
 */
function matches(granted: string, required: string): boolean {
  if (granted === "*" || granted === required) return true;
  if (!granted.endsWith(".*")) return false;

  const prefix = granted.slice(0, -2);
  return required === prefix || required.startsWith(`${prefix}.`);
}
