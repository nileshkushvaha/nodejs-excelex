import { Prisma } from "@prisma/client";

import {
  ClientContextMismatchError,
  MissingClientContextError,
  NestedWriteError,
} from "./errors";

/**
 * Barrier 1 of two: a Prisma client extension that injects the sealed clientId
 * into every query against a client-scoped model.
 *
 * Barrier 2 is row-level security in PostgreSQL. Neither is trusted alone. This
 * one exists because it fails loudly at the call site, in development, with a
 * stack trace pointing at the offending service — where RLS fails silently by
 * returning nothing. RLS exists because this one is bypassed by raw SQL,
 * reporting tools, future services and its own documented gaps below.
 *
 * Two of those gaps are real and handled explicitly:
 *
 *   NEW-1  Extensions do not intercept nested reads or writes
 *          (prisma/prisma#24525). client.a.update({ data: { bs: { update: … } } })
 *          never runs the `b` extension, so this barrier is simply absent for
 *          nested writes. They are rejected rather than silently unprotected.
 *
 *   NEW-2  upsert's create branch is not covered by injecting into `where`.
 *          A mismatch turns an intended update into a cross-client insert, which
 *          surfaces as a confusing unique-constraint violation rather than an
 *          authorization error. clientId is injected into `create` as well.
 */

/** Which models are client-scoped, and which of their fields are relations. */
interface ModelShape {
  readonly isClientScoped: boolean;
  readonly relationFields: ReadonlySet<string>;
}

/**
 * Enumerated from the DMMF at runtime, never from a hand-written list. A model
 * added in a later phase is covered on the day it is added rather than on the
 * day someone remembers to add it here.
 */
const MODEL_SHAPES: ReadonlyMap<string, ModelShape> = new Map(
  Prisma.dmmf.datamodel.models.map((model) => [
    model.name,
    {
      isClientScoped: model.fields.some((f) => f.name === "clientId"),
      relationFields: new Set(
        model.fields.filter((f) => f.kind === "object").map((f) => f.name),
      ),
    },
  ]),
);

/** Nested `connect` cannot create or modify a row, and the composite foreign keys
 *  on (client_id, id) already make a cross-client connect impossible. Every other
 *  nested verb writes, and writes are what the extension cannot see. */
const SAFE_NESTED_VERBS: ReadonlySet<string> = new Set(["connect"]);

const OPERATIONS_WITH_WHERE = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
]);

const OPERATIONS_WITH_DATA = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Rejects a nested write, which this barrier provably cannot cover (NEW-1). */
function assertNoNestedWrite(
  data: unknown,
  shape: ModelShape,
  model: string,
  operation: string,
): void {
  if (!isPlainObject(data)) return;

  for (const [key, value] of Object.entries(data)) {
    if (!shape.relationFields.has(key) || !isPlainObject(value)) continue;

    const writesNested = Object.keys(value).some((verb) => !SAFE_NESTED_VERBS.has(verb));
    if (writesNested) throw new NestedWriteError(model, operation, key);
  }
}

/**
 * Injects clientId, or rejects a value that contradicts the sealed context.
 * Overwriting a mismatch silently would turn a caller bug into a caller bug that
 * still passes its tests.
 */
function withClientId(
  target: unknown,
  clientId: string,
  model: string,
  operation: string,
): Record<string, unknown> {
  const base = isPlainObject(target) ? target : {};
  const supplied = base["clientId"];

  if (typeof supplied === "string" && supplied !== clientId) {
    throw new ClientContextMismatchError(model, operation, supplied, clientId);
  }

  return { ...base, clientId };
}

export function clientScopeExtension(getClientId: () => string | undefined) {
  return Prisma.defineExtension({
    name: "excelex-client-scope",
    query: {
      $allModels: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma's own extension signature is untyped here.
        async $allOperations({ model, operation, args, query }: any) {
          const shape = MODEL_SHAPES.get(model);

          // Platform-scoped models carry no clientId. They are unreachable to the
          // client runtime role at the database level (REVOKE ALL), so this
          // extension has nothing to add and must not invent a filter.
          if (!shape?.isClientScoped) return query(args);

          const clientId = getClientId();
          if (!clientId) throw new MissingClientContextError(model, operation);

          const next: Record<string, unknown> = { ...(args ?? {}) };

          if (OPERATIONS_WITH_WHERE.has(operation)) {
            next["where"] = withClientId(next["where"], clientId, model, operation);
          }

          if (OPERATIONS_WITH_DATA.has(operation)) {
            const data = next["data"];
            if (Array.isArray(data)) {
              next["data"] = data.map((row) => {
                assertNoNestedWrite(row, shape, model, operation);
                return withClientId(row, clientId, model, operation);
              });
            } else {
              assertNoNestedWrite(data, shape, model, operation);
              next["data"] = withClientId(data, clientId, model, operation);
            }
          }

          // upsert needs all three: `where` selects, `create` is the branch that
          // injecting into `where` does not reach (NEW-2), `update` is the other.
          if (operation === "upsert") {
            next["where"] = withClientId(next["where"], clientId, model, operation);
            assertNoNestedWrite(next["create"], shape, model, operation);
            assertNoNestedWrite(next["update"], shape, model, operation);
            next["create"] = withClientId(next["create"], clientId, model, operation);
            next["update"] = withClientId(next["update"], clientId, model, operation);
          }

          return query(next);
        },
      },
    },
  });
}

/** Exported for the coverage test: the models this barrier considers client-scoped. */
export function clientScopedModelNames(): string[] {
  return [...MODEL_SHAPES.entries()]
    .filter(([, shape]) => shape.isClientScoped)
    .map(([name]) => name)
    .sort();
}
