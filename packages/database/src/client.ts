import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import {
  assertValidClientId,
  clientContextStorage,
  currentClientId,
} from "./context";
import { clientScopeExtension } from "./scope";

/**
 * Transaction bounds. Both are stated rather than inherited: under this design
 * every client-scoped request opens a transaction, so `maxWait` governs
 * behaviour under pool pressure and Prisma's 2s default would surface as
 * mysterious request failures long before the pool is actually exhausted.
 */
const DEFAULT_MAX_WAIT_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 15_000;

export interface ClientPrismaOptions {
  readonly connectionString: string;
  /** Overridden only by tests that need to drive the context directly. */
  readonly getClientId?: () => string | undefined;
}

/**
 * The client runtime's database handle: connects as excelex_app, which holds no
 * privileges on platform tables and is subject to row-level security.
 */
export function createClientPrisma(options: ClientPrismaOptions) {
  const base = new PrismaClient({
    adapter: new PrismaPg({ connectionString: options.connectionString }),
  });

  return base.$extends(clientScopeExtension(options.getClientId ?? currentClientId));
}

/**
 * The control plane's database handle: connects as excelex_platform. No client
 * scope extension, because platform models have no clientId — the separation is
 * enforced by grants, not by a filter.
 */
export function createPlatformPrisma(connectionString: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/**
 * The background runtime's handle: connects as excelex_jobs, which may read
 * and update a short, enumerated list of client tables across every client
 * (see 01-roles-and-rls.sql §4) and nothing else. It exists for the two pieces
 * of work that are inherently cross-client — sweeping expired sessions and
 * dispatching due schedules — so that neither needs BYPASSRLS. Everything a
 * dispatched job then does runs under the client's own context.
 */
export function createJobsPrisma(connectionString: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export type ClientPrisma = ReturnType<typeof createClientPrisma>;
export type PlatformPrisma = ReturnType<typeof createPlatformPrisma>;
export type JobsPrisma = ReturnType<typeof createJobsPrisma>;

export interface ClientContextOptions {
  readonly maxWaitMs?: number;
  readonly timeoutMs?: number;
}

/**
 * Runs `fn` with both barriers active: the client id sealed into the extension's
 * context, and `app.client_id` set on the connection so RLS admits exactly this
 * client's rows.
 *
 * The transaction is not incidental. `set_config(..., true)` is transaction-local,
 * which is the entire reason it is safe on a pooled connection: the setting
 * reverts on commit or rollback and cannot leak into whichever request borrows
 * the connection next. A session-level SET would persist and hand one client's
 * context to another — the single worst failure this design can have, and the
 * reason the isolation proof asserts that a context does not survive its
 * transaction.
 */
export async function withClientContext<T>(
  prisma: ClientPrisma,
  clientId: string,
  fn: (tx: Omit<ClientPrisma, "$transaction" | "$connect" | "$disconnect" | "$on" | "$extends">) => Promise<T>,
  options: ClientContextOptions = {},
): Promise<T> {
  assertValidClientId(clientId);

  return clientContextStorage.run({ clientId }, () =>
    prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.client_id', ${clientId}, true)`;
        return fn(tx as never);
      },
      {
        maxWait: options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS,
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      },
    ),
  );
}

export interface ResolvedClient {
  readonly clientId: string;
  readonly status: string;
}

/**
 * Resolves a hostname to a client.
 *
 * `client_hostnames` is a platform table and the client runtime role has no
 * privileges on it whatsoever. This SECURITY DEFINER function is the only legal
 * path: it returns two columns, takes a hostname (a public fact) rather than a
 * caller-supplied client id, pins its search_path, and has EXECUTE revoked from
 * PUBLIC. See prisma/sql/01-roles-and-rls.sql §6.
 */
export async function resolveClientByHost(
  prisma: ClientPrisma,
  hostname: string,
): Promise<ResolvedClient | null> {
  const rows = await prisma.$queryRaw<Array<{ client_id: string; status: string }>>`
    SELECT client_id, status FROM public.resolve_client_by_host(${hostname})
  `;

  const row = rows[0];
  return row ? { clientId: row.client_id, status: row.status } : null;
}
