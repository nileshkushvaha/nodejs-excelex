/**
 * Thrown when a client-scoped query is attempted with no client context sealed.
 *
 * This is deliberately an exception rather than an empty result. A query that
 * silently returns nothing looks like "no data" to the caller and to the tests,
 * and the missing barrier is discovered in production. Failing loudly is the
 * whole value of the application-layer barrier — the database would also deny
 * the rows, but it would deny them silently.
 */
export class MissingClientContextError extends Error {
  readonly code = "MISSING_CLIENT_CONTEXT";

  constructor(model: string, operation: string) {
    super(
      `${model}.${operation} was called with no client context. ` +
        `Client-scoped work must run inside withClientContext().`,
    );
    this.name = "MissingClientContextError";
  }
}

/**
 * Thrown when a caller supplies a clientId that contradicts the sealed context.
 *
 * The context is the only authority on client identity. A mismatch means the
 * caller built a query by hand from a value that did not come from the trusted
 * host — which in a correct client never happens, so it is treated as an
 * attempted boundary crossing rather than quietly overwritten.
 */
export class ClientContextMismatchError extends Error {
  readonly code = "CLIENT_CONTEXT_MISMATCH";

  constructor(model: string, operation: string, supplied: string, sealed: string) {
    super(
      `${model}.${operation} supplied clientId ${supplied} while the sealed ` +
        `context is ${sealed}. The context is the only authority on client identity.`,
    );
    this.name = "ClientContextMismatchError";
  }
}

/** Thrown when a nested write is attempted in client-scoped code. See NESTED_WRITE_NOTE. */
export class NestedWriteError extends Error {
  readonly code = "NESTED_WRITE_FORBIDDEN";

  constructor(model: string, operation: string, relation: string) {
    super(
      `${model}.${operation} contains a nested write on "${relation}". ` +
        `Prisma client extensions do not intercept nested writes (prisma/prisma#24525), ` +
        `so the application-layer client barrier is absent for them. Perform the ` +
        `operations sequentially inside the same withClientContext() transaction.`,
    );
    this.name = "NestedWriteError";
  }
}
