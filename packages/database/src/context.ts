import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The sealed client identity for the current unit of work.
 *
 * It lives here, in the data-access package, rather than in the HTTP layer,
 * because the extension and the transaction helper must read the *same* value.
 * Two stores would let the application-layer barrier and the database-layer
 * barrier disagree about who the caller is, which is worse than having one.
 *
 * Nothing writes to this store except withClientContext().
 */
export interface ClientContext {
  readonly clientId: string;
}

export const clientContextStorage = new AsyncLocalStorage<ClientContext>();

export function currentClientId(): string | undefined {
  return clientContextStorage.getStore()?.clientId;
}

/**
 * PostgreSQL raises 22P02 on a malformed uuid, and the value reaches a
 * set_config() call, so it is validated before it gets near the database.
 * set_config takes it as a bind parameter — SET LOCAL cannot (audit finding
 * CT-3) — but a validated input is still the cheaper failure.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertValidClientId(clientId: string): void {
  if (!UUID.test(clientId)) {
    throw new Error(`Refusing to seal a client context with a malformed id: ${clientId}`);
  }
}
