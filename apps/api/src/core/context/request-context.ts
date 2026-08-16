import { AsyncLocalStorage } from "node:async_hooks";

import type { GrantSet } from "@excelex/permissions";

/**
 * Everything the request layer knows about who is asking, sealed once by the
 * client-resolution middleware and immutable thereafter.
 *
 * `clientId` is derived from the trusted host and nothing else. A clientId
 * arriving in a body, a query string or a client-set header is not merely
 * ignored — it is rejected, because in a correct caller it never happens, and
 * treating it as noise is how a boundary erodes.
 */
export interface ContextActor {
  readonly userId: string;
  readonly email: string;
  readonly fullName: string;
  readonly permissions: readonly string[];
  readonly grants: GrantSet;
  readonly branchIds: readonly string[];
}

export interface RequestContext {
  readonly requestId: string;
  readonly host: string;
  readonly hostKind: "client" | "platform" | "public";
  readonly clientId?: string;
  readonly clientStatus?: string;
  /**
   * Attached exactly once by the authentication guard, and readonly to everyone
   * else. Identity-of-client is sealed by the middleware and never changes;
   * identity-of-actor is not known until the session is resolved, which happens
   * after. Attaching is not the same as re-sealing — see attachActor().
   */
  readonly actor?: ContextActor;
  readonly ip?: string;
  readonly userAgent?: string;
  readonly startedAt: Date;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * The client id of the current request, or undefined on a public or platform
 * host. Callers that require one should use requireClientId().
 */
export function currentContextClientId(): string | undefined {
  return storage.getStore()?.clientId;
}

/**
 * Records the authenticated actor on the current context.
 *
 * The guard cannot simply re-run the rest of the request in a new context: an
 * AsyncLocalStorage.run() scope ends when its callback returns, so a context
 * established in canActivate would be gone by the time the controller executes.
 * The store object established by the middleware is therefore extended in place,
 * exactly once — a second call is a bug, and treated as one.
 */
export function attachActor(actor: ContextActor): void {
  const context = storage.getStore();
  if (!context) throw new Error("No request context is sealed for this execution.");
  if (context.actor) throw new Error("An actor is already attached to this request context.");

  (context as { actor?: ContextActor }).actor = actor;
}

export function requireRequestContext(): RequestContext {
  const context = storage.getStore();
  if (!context) throw new Error("No request context is sealed for this execution.");
  return context;
}
