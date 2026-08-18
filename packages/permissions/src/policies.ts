import { PERMISSION_KEYS } from "./catalogue";

/**
 * What each action on each resource requires.
 *
 * This is the Gate. Before it, every route named a permission string inline
 * and every screen tested `permissions.includes("masters.customer.manage")`,
 * which meant the answer to "who may delete a customer" was spread over a
 * controller, four pages and whatever anyone typed today. One table now says
 * it, the API asks it, the browser asks the same table, and changing the rule
 * is one line rather than a search.
 *
 * The actions are deliberately CRUD-shaped — view, create, update, delete,
 * import, export — because that is what a master screen does. A resource
 * needing something else says so with its own key.
 *
 * Import and export are separate actions rather than folded into view and
 * update. They are the two that move data in bulk across the boundary of the
 * system, and a client who wants "look but do not download the customer list"
 * can express it by pointing export at a permission of its own. Today they
 * follow view and manage; that is a decision recorded here, not an assumption
 * buried in a controller.
 */
export type Action = "view" | "create" | "update" | "delete" | "import" | "export";

type Policy = Partial<Record<Action, string>> & { view: string };

/** Every resource with a master screen, and what its actions need. */
export const POLICIES = {
  customer: crud("masters.customer"),
  consignee: crud("masters.customer"),
  shipper: crud("masters.customer"),
  salesExecutive: crud("masters.customer"),
  vendor: crud("masters.vendor"),
  lookup: crud("masters.customer"),
  pinCode: crud("masters.destination"),

  destination: crud("masters.destination"),
  serviceCentre: crud("masters.branch"),
  branch: crud("masters.branch"),

  product: crud("masters.product"),
  productType: crud("masters.product"),
  productGroup: crud("masters.product"),

  zone: crud("masters.rate"),
  charge: crud("masters.rate"),
  accountGroup: crud("masters.rate"),

  department: crud("masters.organisation"),
  designation: crud("masters.organisation"),

  // Reference data is platform-owned and read-only to a client. Naming the
  // write actions after a permission nobody holds is deliberate: the screens
  // then hide their buttons for the same reason the API would refuse them.
  country: readOnly("masters.destination"),
  state: readOnly("masters.destination"),

  user: crud("settings.user"),
  role: crud("settings.role"),
  clientSettings: crud("settings.general"),
  securitySettings: crud("settings.security"),
  mailSettings: crud("settings.mail"),

  // The System screens. Most are read-only views over what the platform is
  // doing; the ones with a manage half name it, and the rest point their
  // write actions at a permission nobody holds so the buttons hide.
  job: crud("system.queue"),
  jobSchedule: crud("system.schedule"),
  cache: crud("system.cache"),
  activityLog: readOnly("settings.audit"),
  loginHistory: readOnly("system.login"),
  performance: readOnly("system.performance"),
} as const satisfies Record<string, Policy>;

export type Resource = keyof typeof POLICIES;

/**
 * A master's six actions from one permission pair.
 *
 * Export follows view and import follows manage, because an export is a read
 * and an import is a write — no matter how much of one it does at a time.
 */
function crud(prefix: string): Required<Policy> {
  return {
    view: `${prefix}.view`,
    create: `${prefix}.manage`,
    update: `${prefix}.manage`,
    delete: `${prefix}.manage`,
    import: `${prefix}.manage`,
    export: `${prefix}.view`,
  };
}

function readOnly(prefix: string): Required<Policy> {
  const never = "platform.reference.manage";
  return {
    view: `${prefix}.view`,
    create: never,
    update: never,
    delete: never,
    import: never,
    export: `${prefix}.view`,
  };
}

/** The permission an action needs, or throws if the pair is not in the table. */
export function permissionFor(resource: Resource, action: Action): string {
  const policy = POLICIES[resource] as Partial<Record<Action, string>>;
  const permission = policy[action];

  if (!permission) {
    // A missing entry is a programming error, not a denial. Failing loudly
    // here beats failing open at a route nobody tested.
    throw new Error(`No policy for ${String(resource)}.${action}`);
  }

  return permission;
}

/**
 * Every permission the table names, for the catalogue check below.
 *
 * A policy pointing at a permission that does not exist would be a route
 * nobody can ever call — the guard would look for a grant no role can hold.
 */
export function policyPermissions(): string[] {
  const all = new Set<string>();
  for (const policy of Object.values(POLICIES)) {
    for (const permission of Object.values(policy)) all.add(permission);
  }
  return [...all].sort();
}

/**
 * Names a policy uses that the catalogue does not define.
 *
 * Exported rather than asserted at import time so the check runs in a test,
 * where a failure is a red build instead of an API that will not boot.
 */
export function unknownPolicyPermissions(): string[] {
  const known = new Set<string>(PERMISSION_KEYS);
  // The reference resources deliberately point at a permission no role holds.
  known.add("platform.reference.manage");
  return policyPermissions().filter((permission) => !known.has(permission));
}
