export {
  createClientPrisma,
  createPlatformPrisma,
  resolveClientByHost,
  withClientContext,
  type ClientContextOptions,
  type ClientPrisma,
  type ClientPrismaOptions,
  type PlatformPrisma,
  type ResolvedClient,
} from "./client";

export {
  assertValidClientId,
  clientContextStorage,
  currentClientId,
  type ClientContext,
} from "./context";

export {
  ClientContextMismatchError,
  MissingClientContextError,
  NestedWriteError,
} from "./errors";

export { clientScopedModelNames } from "./scope";

export { Prisma, type PrismaClient } from "@prisma/client";
export type {
  AuditEvent,
  Branch,
  Client,
  ClientHostname,
  Invitation,
  Plan,
  PlanLimit,
  PlatformAuditEvent,
  PlatformSession,
  PlatformUser,
  Role,
  Session,
  Subscription,
  User,
  UserRole,
} from "@prisma/client";
export { ClientStatus, EnforcementMode, SupportMode } from "@prisma/client";

export { hashPassword, verifyPassword } from "./password";

export { syncPermissionCatalogue } from "./sync-permissions";
