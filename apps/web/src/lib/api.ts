import { cookies, headers } from "next/headers";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:3001";

export interface CurrentSession {
  client: { id: string; host: string; status?: string };
  user: { id: string; email: string; fullName: string; permissions: string[] };
}

export interface DashboardSummary {
  counts: { users: number; branches: number; roles: number; activeSessions: number };
  recentActivity: Array<{ id: string; action: string; entity: string | null; createdAt: string }>;
}

/**
 * Server-side API client.
 *
 * No business rule executes in the browser, and no page reaches the database:
 * every authenticated read goes through the API, over a request that forwards
 * the session cookie and the original Host — the Host being what the API
 * resolves the client from, so getting it wrong would serve the wrong client's
 * data rather than fail.
 *
 * Reading cookies() also opts every calling route into dynamic rendering, which
 * is what keeps one client's page out of a cache another client could be served
 * from.
 */
async function apiFetch(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Response> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);

  const cookieHeader = cookieStore
    .getAll()
    .map((entry) => `${entry.name}=${entry.value}`)
    .join("; ");

  return fetch(`${API_ORIGIN}${path}`, {
    method: init.method ?? "GET",
    headers: {
      cookie: cookieHeader,
      host: headerStore.get("host") ?? "localhost",
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    // Redundant against Next 16's defaults, but a cheap guarantee that survives
    // a refactor which removes the cookie read above.
    cache: "no-store",
  });
}

/**
 * Returns null for both "you may not see this" and "the API is unreachable".
 *
 * A transient network failure throws out of fetch(), and an uncaught throw in a
 * server component takes the whole page down with a 500. Callers already handle
 * null by rendering an explanation, so the page degrades to that instead of
 * disappearing while the API restarts.
 */
async function get<T>(path: string): Promise<T | null> {
  try {
    const response = await apiFetch(path);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Used by server actions. The API's own message is surfaced verbatim rather than
 * replaced with something friendlier: "You cannot grant X because you do not
 * hold it yourself" is the useful answer, and a generic "something went wrong"
 * would leave an administrator guessing at an authorization rule.
 */
export async function apiMutate(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<ActionResult> {
  let response: Response;
  try {
    response = await apiFetch(path, { method, body });
  } catch {
    return { ok: false, error: "Could not reach the server. Nothing was changed." };
  }

  if (response.ok) return { ok: true };

  const payload = (await response.json().catch(() => null)) as
    | { message?: string | string[] }
    | null;
  const message = Array.isArray(payload?.message) ? payload.message[0] : payload?.message;

  return { ok: false, error: message ?? `Request failed (${response.status}).` };
}

export interface PermissionCatalogueEntry {
  key: string;
  group: string;
  label: string;
  description: string;
}

export interface RoleSummary {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  assignedUsers: number;
}

export interface UserSummary {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  lastLoginAt: string | null;
  roles: Array<{ roleId: string; name: string; branchCode: string | null; expiresAt: string | null }>;
  directCount: number;
  denyCount: number;
}

export interface UserAccess {
  user: { id: string; email: string; fullName: string; isActive: boolean };
  roles: Array<{
    roleId: string;
    name: string;
    branch: { id: string; code: string } | null;
    expiresAt: string | null;
  }>;
  direct: Array<{
    permission: string;
    effect: "ALLOW" | "DENY";
    reason: string | null;
    expiresAt: string | null;
  }>;
}

export interface Branch {
  id: string;
  code: string;
  name: string;
}

export interface Profile {
  id: string;
  email: string;
  fullName: string;
  lastLoginAt: string | null;
  createdAt: string;
  roles: string[];
  branches: Branch[];
}

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
  preventReuse: boolean;
  historyCount: number;
  expiryEnabled: boolean;
  expiryDays: number;
  forceChangeOnFirstLogin: boolean;
  updatedAt: string | null;
}

export interface ActiveSession {
  id: string;
  host: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  idleExpiresAt: string;
  current: boolean;
}

export const getPermissionCatalogue = () =>
  get<{ permissions: PermissionCatalogueEntry[] }>("/api/v1/access/permissions");
export const getRoles = () => get<RoleSummary[]>("/api/v1/access/roles");
export const getUsers = () => get<UserSummary[]>("/api/v1/access/users");
export const getBranches = () => get<Branch[]>("/api/v1/access/branches");
export const getUserAccess = (userId: string) =>
  get<UserAccess>(`/api/v1/access/users/${userId}`);
export const getProfile = () => get<Profile>("/api/v1/profile");
export const getActiveSessions = () => get<ActiveSession[]>("/api/v1/profile/sessions");
export const getPasswordPolicy = () => get<PasswordPolicy>("/api/v1/settings/password-policy");

/** Returns null when unauthenticated, so callers redirect rather than crash. */
export async function getCurrentSession(): Promise<CurrentSession | null> {
  return get<CurrentSession>("/api/v1/auth/me");
}

export async function getDashboardSummary(): Promise<DashboardSummary | null> {
  return get<DashboardSummary>("/api/v1/dashboard/summary");
}
