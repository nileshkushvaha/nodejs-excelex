import {
  PERMISSION_KEYS,
  SUPER_PERMISSION,
  expandPermissions,
  resolvePermissions,
  type GrantSet,
} from "@excelex/permissions";

/** The shape the auth queries load. Kept narrow so the include list stays honest. */
export interface UserWithGrants {
  readonly userRoles: ReadonlyArray<{
    roleId: string;
    branchId: string | null;
    expiresAt: Date | null;
    role: { rolePermissions: ReadonlyArray<{ permissionKey: string }> };
  }>;
  readonly userPermissions: ReadonlyArray<{
    permissionKey: string;
    effect: "ALLOW" | "DENY";
    expiresAt: Date | null;
  }>;
}

/**
 * Collapses a user's role assignments and direct grants into the pure data the
 * resolver works on.
 *
 * Assignments of the same role to different branches become one entry with a
 * combined branch list, so "Operations Manager in Delhi and Mumbai" is one
 * assignment covering two branches rather than two competing answers.
 */
export function toGrantSet(user: UserWithGrants): GrantSet {
  const byRole = new Map<
    string,
    { roleId: string; permissions: string[]; branchIds: string[]; expiresAt: Date | null }
  >();

  for (const assignment of user.userRoles) {
    const existing = byRole.get(assignment.roleId);

    if (!existing) {
      byRole.set(assignment.roleId, {
        roleId: assignment.roleId,
        permissions: assignment.role.rolePermissions.map((rp) => rp.permissionKey),
        branchIds: assignment.branchId ? [assignment.branchId] : [],
        expiresAt: assignment.expiresAt,
      });
      continue;
    }

    // A client-wide assignment beats a branch-scoped one: an empty branch list
    // means "everywhere", so adding branches to it would narrow real authority.
    if (existing.branchIds.length > 0) {
      if (assignment.branchId) existing.branchIds.push(assignment.branchId);
      else existing.branchIds = [];
    }

    // The most generous expiry wins, for the same reason.
    if (!assignment.expiresAt) existing.expiresAt = null;
    else if (existing.expiresAt && assignment.expiresAt > existing.expiresAt) {
      existing.expiresAt = assignment.expiresAt;
    }
  }

  return {
    roles: [...byRole.values()],
    direct: user.userPermissions.map((grant) => ({
      permission: grant.permissionKey,
      effect: grant.effect,
      expiresAt: grant.expiresAt,
    })),
  };
}

/**
 * The concrete permission list an actor holds, with wildcards expanded and
 * denials applied — so what a UI renders and what the guard enforces are the
 * same answer computed the same way.
 */
export function effectivePermissions(grants: GrantSet): string[] {
  return expandPermissions(grants, [SUPER_PERMISSION, ...PERMISSION_KEYS]);
}

export { resolvePermissions };
