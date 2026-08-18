export {
  createClientPrisma,
  createPlatformPrisma,
  createJobsPrisma,
  resolveClientByHost,
  withClientContext,
  type ClientContextOptions,
  type ClientPrisma,
  type ClientPrismaOptions,
  type PlatformPrisma,
  type JobsPrisma,
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

export { COUNTRY_ROWS, countrySeeds, type CountrySeed } from "./reference/countries";
export {
  COURIER_DEPARTMENTS,
  EXECUTIVE_DESIGNATIONS,
  INDIA_STATES,
  type DepartmentSeed,
  type StateSeed,
} from "./reference/india";
export { seedCountriesAndStates, seedOrganisationMasters } from "./reference/seed-reference";
export { PRODUCTS, PRODUCT_GROUPS, PRODUCT_TYPES, seedProductMasters } from "./reference/products";
export { CHARGES, seedCharges } from "./reference/charges";
