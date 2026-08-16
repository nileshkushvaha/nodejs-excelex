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
async function apiFetch(path: string): Promise<Response> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);

  const cookieHeader = cookieStore
    .getAll()
    .map((entry) => `${entry.name}=${entry.value}`)
    .join("; ");

  return fetch(`${API_ORIGIN}${path}`, {
    headers: {
      cookie: cookieHeader,
      host: headerStore.get("host") ?? "localhost",
    },
    // Redundant against Next 16's defaults, but a cheap guarantee that survives
    // a refactor which removes the cookie read above.
    cache: "no-store",
  });
}

/** Returns null when unauthenticated, so callers redirect rather than crash. */
export async function getCurrentSession(): Promise<CurrentSession | null> {
  const response = await apiFetch("/api/v1/auth/me");
  if (!response.ok) return null;
  return (await response.json()) as CurrentSession;
}

export async function getDashboardSummary(): Promise<DashboardSummary | null> {
  const response = await apiFetch("/api/v1/dashboard/summary");
  if (!response.ok) return null;
  return (await response.json()) as DashboardSummary;
}
