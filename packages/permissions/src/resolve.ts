import { SUPER_PERMISSION } from "./catalogue";

/**
 * Effective-permission resolution.
 *
 * Pure functions over plain data: no database, no request, no cache. That is
 * what makes the rules testable in isolation — the interesting failures here
 * are logic errors in precedence, not query errors.
 */

export type PermissionEffect = "ALLOW" | "DENY";

export interface RoleAssignment {
  readonly roleId: string;
  readonly permissions: readonly string[];
  /** Empty means the role applies in every branch. */
  readonly branchIds: readonly string[];
  readonly expiresAt?: Date | null;
}

export interface DirectPermission {
  readonly permission: string;
  readonly effect: PermissionEffect;
  readonly expiresAt?: Date | null;
}

export interface GrantSet {
  readonly roles: readonly RoleAssignment[];
  readonly direct: readonly DirectPermission[];
}

export interface ResolveOptions {
  /** Resolve within one branch. Omitted means "not branch-specific". */
  readonly branchId?: string | undefined;
  readonly now?: Date;
}

/**
 * Wildcard matching.
 *
 * A grant of `operations.*` covers `operations.shipment.create`; a grant of
 * `operations.shipment.*` covers its actions. Matching is on dot-separated
 * segments rather than substrings, so `operations.ship*` matches nothing —
 * a prefix that stops mid-segment is almost always a typo, and treating it as a
 * match would silently over-grant.
 */
export function permissionMatches(grant: string, required: string): boolean {
  if (grant === SUPER_PERMISSION || grant === required) return true;
  if (!grant.endsWith(".*")) return false;

  const prefix = grant.slice(0, -2);
  return required === prefix || required.startsWith(`${prefix}.`);
}

function isLive(expiresAt: Date | null | undefined, now: Date): boolean {
  return !expiresAt || expiresAt > now;
}

function appliesToBranch(assignment: RoleAssignment, branchId: string | undefined): boolean {
  // A role with no branches is client-wide.
  if (assignment.branchIds.length === 0) return true;

  // No branch named: the question is "may this person book shipments at all?",
  // and a branch manager may. Branch scope answers a different question — "may
  // they book *this* shipment?" — which is checked against the target record,
  // not against the menu. Conflating the two would hide the Shipments screen
  // from every branch-scoped operator in the company.
  if (!branchId) return true;

  return assignment.branchIds.includes(branchId);
}

/**
 * Resolves the grants that apply, then answers a permission question.
 *
 * Precedence, in order:
 *   1. An unexpired DENY wins over everything, including a super grant. This is
 *      the piece Spatie has no equivalent for, and it is what makes "this role,
 *      except this one action, for this one person" expressible without
 *      inventing a near-duplicate role.
 *   2. A direct ALLOW grants.
 *   3. A role that applies in this branch scope grants.
 *   4. Otherwise denied. There is no implicit grant anywhere.
 */
export function resolvePermissions(grants: GrantSet, options: ResolveOptions = {}) {
  const now = options.now ?? new Date();

  const allowed: string[] = [];
  const denied: string[] = [];

  for (const assignment of grants.roles) {
    if (!isLive(assignment.expiresAt, now)) continue;
    if (!appliesToBranch(assignment, options.branchId)) continue;
    allowed.push(...assignment.permissions);
  }

  for (const direct of grants.direct) {
    if (!isLive(direct.expiresAt, now)) continue;
    (direct.effect === "DENY" ? denied : allowed).push(direct.permission);
  }

  const has = (required: string): boolean => {
    if (denied.some((rule) => permissionMatches(rule, required))) return false;
    return allowed.some((grant) => permissionMatches(grant, required));
  };

  return {
    /** Granted, before denials are applied. Useful for showing why in a UI. */
    granted: [...new Set(allowed)].sort(),
    denied: [...new Set(denied)].sort(),
    has,
    hasAny: (required: readonly string[]) => required.some(has),
    hasAll: (required: readonly string[]) => required.every(has),
  };
}

export type ResolvedPermissions = ReturnType<typeof resolvePermissions>;

/**
 * The concrete permission list this actor effectively holds, expanded against
 * the catalogue. Wildcards are expanded and denials removed, so the answer a UI
 * renders is the same answer the guard would give.
 */
export function expandPermissions(
  grants: GrantSet,
  catalogue: readonly string[],
  options: ResolveOptions = {},
): string[] {
  const resolved = resolvePermissions(grants, options);
  return catalogue.filter((key) => resolved.has(key));
}
