import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  PERMISSION_DEFINITIONS,
  SUPER_PERMISSION,
  isKnownPermission,
  permissionMatches,
} from "@excelex/permissions";

import { requireRequestContext } from "../core/context/request-context";
import { ActorCache } from "../auth/actor-cache";
import { PrismaService } from "../core/database/prisma.service";

export interface RoleSummary {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  assignedUsers: number;
}

/**
 * Role and permission administration.
 *
 * Every mutation writes an audit event. Permission changes are precisely what an
 * incident review asks about — "who could do this, and since when?" — and a
 * grant table without a history can only answer the first half.
 */
@Injectable()
export class AccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actors: ActorCache,
  ) {}

  /** The catalogue, for a role editor. Served from code, which is its source of truth. */
  catalogue() {
    return {
      permissions: [
        {
          key: SUPER_PERMISSION,
          group: "Settings",
          label: "All permissions",
          description: "Grants everything, including permissions added in future releases.",
        },
        ...PERMISSION_DEFINITIONS.filter(
          (definition) => !("deprecated" in definition && definition.deprecated),
        ),
      ],
    };
  }

  /**
   * Rejects a permission the code does not implement.
   *
   * Grant rows carry no foreign key to the catalogue, because a wildcard has no
   * catalogue row. This is where that integrity is actually enforced — a
   * wildcard must match at least one real permission, so a typo like
   * `operation.*` is refused rather than stored as a grant that silently does
   * nothing.
   */
  private assertGrantable(permission: string): void {
    if (permission === SUPER_PERMISSION) return;

    if (permission.endsWith(".*")) {
      const covered = PERMISSION_DEFINITIONS.some((definition) =>
        permissionMatches(permission, definition.key),
      );
      if (!covered) {
        throw new BadRequestException(`"${permission}" matches no known permission.`);
      }
      return;
    }

    if (!isKnownPermission(permission)) {
      throw new BadRequestException(`"${permission}" is not a known permission.`);
    }
  }

  /**
   * Refuses to grant what the actor does not itself hold.
   *
   * Without this, settings.role.manage is a privilege-escalation primitive: a
   * user who may edit roles could add billing.invoice.finalise to their own role
   * and approve their own payments. Holding a permission is a precondition for
   * conferring it.
   */
  private assertCanConfer(permission: string): void {
    const { actor } = requireRequestContext();
    const held = actor?.permissions ?? [];

    if (permission === SUPER_PERMISSION) {
      if (!held.includes(SUPER_PERMISSION)) {
        throw new ForbiddenException("Only a full administrator may grant all permissions.");
      }
      return;
    }

    const covered = held.some((grant) => permissionMatches(grant, permission));
    if (!covered) {
      throw new ForbiddenException(
        `You cannot grant "${permission}" because you do not hold it yourself.`,
      );
    }
  }

  async listRoles(): Promise<RoleSummary[]> {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const roles = await tx.role.findMany({
        where: { deletedAt: null },
        include: { rolePermissions: true, _count: { select: { userRoles: true } } },
        orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      });

      return roles.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        permissions: role.rolePermissions.map((rp) => rp.permissionKey).sort(),
        assignedUsers: role._count.userRoles,
      }));
    });
  }

  async createRole(name: string, description: string | null, permissions: string[]) {
    const { clientId, actor } = requireRequestContext();

    for (const permission of permissions) {
      this.assertGrantable(permission);
      this.assertCanConfer(permission);
    }

    return this.prisma.forClient(clientId!, async (tx) => {
      // deletedAt filtered: a soft-deleted role is a tombstone, not a name
      // reservation. The unique index is partial for the same reason.
      const existing = await tx.role.findFirst({ where: { name, deletedAt: null } });
      if (existing) throw new BadRequestException(`A role named "${name}" already exists.`);

      const role = await tx.role.create({
        data: { clientId: clientId!, name, description, isSystem: false },
      });

      for (const permissionKey of permissions) {
        await tx.rolePermission.create({
          data: { clientId: clientId!, roleId: role.id, permissionKey },
        });
      }

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "access.role.created",
          entity: "role",
          entityId: role.id,
          metadata: { name, permissions },
        },
      });

      return { id: role.id };
    });
  }

  /**
   * Replaces a role's permission set.
   *
   * Computed as a diff rather than delete-then-insert so the audit event records
   * what actually changed. "Permissions replaced" tells a reviewer nothing;
   * "added billing.invoice.finalise" tells them everything.
   */
  async setRolePermissions(roleId: string, permissions: string[]) {
    // Everyone holding this role is affected, and the cache is keyed by
    // token rather than by role. Ten seconds of extra reads beats working
    // out which sessions to drop.
    this.actors.clear();
    const { clientId, actor } = requireRequestContext();

    for (const permission of permissions) {
      this.assertGrantable(permission);
      this.assertCanConfer(permission);
    }

    return this.prisma.forClient(clientId!, async (tx) => {
      const role = await tx.role.findFirst({
        where: { id: roleId, deletedAt: null },
        include: { rolePermissions: true },
      });
      if (!role) throw new NotFoundException("Role not found.");

      const before = new Set(role.rolePermissions.map((rp) => rp.permissionKey));
      const after = new Set(permissions);

      const added = [...after].filter((key) => !before.has(key));
      const removed = [...before].filter((key) => !after.has(key));

      // Removing a permission you do not hold is also conferring: it changes
      // authority you were never given control over.
      for (const permission of removed) this.assertCanConfer(permission);

      if (removed.length > 0) {
        await tx.rolePermission.deleteMany({
          where: { roleId, permissionKey: { in: removed } },
        });
      }

      for (const permissionKey of added) {
        await tx.rolePermission.create({ data: { clientId: clientId!, roleId, permissionKey } });
      }

      if (added.length > 0 || removed.length > 0) {
        await tx.auditEvent.create({
          data: {
            clientId: clientId!,
            actorId: actor?.userId ?? null,
            action: "access.role.permissions_changed",
            entity: "role",
            entityId: roleId,
            metadata: { role: role.name, added, removed },
          },
        });
      }

      return { added, removed };
    });
  }

  async deleteRole(roleId: string) {
    this.actors.clear();
    const { clientId, actor } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const role = await tx.role.findFirst({
        where: { id: roleId, deletedAt: null },
        include: { _count: { select: { userRoles: true } } },
      });
      if (!role) throw new NotFoundException("Role not found.");

      // A client that deletes its only administrator role locks itself out of
      // its own account, and only ExcelEx could then let them back in.
      if (role.isSystem) {
        throw new BadRequestException("System roles cannot be deleted. Amend their permissions instead.");
      }
      if (role._count.userRoles > 0) {
        throw new BadRequestException(
          `${role._count.userRoles} user(s) still hold this role. Unassign them first.`,
        );
      }

      await tx.role.update({ where: { id: roleId }, data: { deletedAt: new Date() } });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "access.role.deleted",
          entity: "role",
          entityId: roleId,
          metadata: { name: role.name },
        },
      });
    });
  }

  async assignRole(userId: string, roleId: string, branchId: string | null, expiresAt: Date | null) {
    // The grant changed, so any cached resolution of it is now wrong.
    this.actors.forgetUser(userId);
    const { clientId, actor } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const role = await tx.role.findFirst({
        where: { id: roleId, deletedAt: null },
        include: { rolePermissions: true },
      });
      if (!role) throw new NotFoundException("Role not found.");

      const user = await tx.user.findFirst({ where: { id: userId, deletedAt: null } });
      if (!user) throw new NotFoundException("User not found.");

      // Assigning a role confers everything it grants.
      for (const rp of role.rolePermissions) this.assertCanConfer(rp.permissionKey);

      // find-then-write rather than upsert: Prisma types a nullable column in a
      // compound unique as non-nullable, so the client-wide (branchId null)
      // assignment is not addressable through the generated upsert input.
      const existing = await tx.userRole.findFirst({ where: { userId, roleId, branchId } });

      const assignment = existing
        ? await tx.userRole.update({
            where: { id: existing.id },
            data: { expiresAt, grantedById: actor?.userId ?? null },
          })
        : await tx.userRole.create({
            data: {
              clientId: clientId!,
              userId,
              roleId,
              branchId,
              expiresAt,
              grantedById: actor?.userId ?? null,
            },
          });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "access.role.assigned",
          entity: "user",
          entityId: userId,
          metadata: { role: role.name, branchId, expiresAt: expiresAt?.toISOString() ?? null },
        },
      });

      return { id: assignment.id };
    });
  }

  async unassignRole(userId: string, roleId: string, branchId: string | null) {
    // The grant changed, so any cached resolution of it is now wrong.
    this.actors.forgetUser(userId);
    const { clientId, actor } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const { count } = await tx.userRole.deleteMany({ where: { userId, roleId, branchId } });
      if (count === 0) throw new NotFoundException("That role assignment does not exist.");

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "access.role.unassigned",
          entity: "user",
          entityId: userId,
          metadata: { roleId, branchId },
        },
      });
    });
  }

  /**
   * Grants or denies a permission to one person, outside any role.
   *
   * A DENY requires a reason and is enforced by a database check constraint as
   * well as here, because a denial nobody can explain later is one nobody dares
   * remove — and undocumented denials accumulate until the permission model is
   * no longer trusted.
   */
  async setDirectPermission(
    userId: string,
    permissionKey: string,
    effect: "ALLOW" | "DENY",
    reason: string | null,
    expiresAt: Date | null,
  ) {
    // The grant changed, so any cached resolution of it is now wrong.
    this.actors.forgetUser(userId);
    const { clientId, actor } = requireRequestContext();

    this.assertGrantable(permissionKey);
    // Denying needs the same authority as granting: silently removing someone's
    // ability to finalise invoices is as consequential as adding it.
    this.assertCanConfer(permissionKey);

    if (effect === "DENY" && !reason?.trim()) {
      throw new BadRequestException("A denial must state a reason.");
    }

    return this.prisma.forClient(clientId!, async (tx) => {
      const user = await tx.user.findFirst({ where: { id: userId, deletedAt: null } });
      if (!user) throw new NotFoundException("User not found.");

      await tx.userPermission.upsert({
        where: { clientId_userId_permissionKey: { clientId: clientId!, userId, permissionKey } },
        create: {
          clientId: clientId!,
          userId,
          permissionKey,
          effect,
          reason,
          expiresAt,
          grantedById: actor?.userId ?? null,
        },
        update: { effect, reason, expiresAt, grantedById: actor?.userId ?? null },
      });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: effect === "DENY" ? "access.permission.denied" : "access.permission.granted",
          entity: "user",
          entityId: userId,
          metadata: { permissionKey, reason, expiresAt: expiresAt?.toISOString() ?? null },
        },
      });
    });
  }

  async clearDirectPermission(userId: string, permissionKey: string) {
    // The grant changed, so any cached resolution of it is now wrong.
    this.actors.forgetUser(userId);
    const { clientId, actor } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const { count } = await tx.userPermission.deleteMany({ where: { userId, permissionKey } });
      if (count === 0) throw new NotFoundException("No such direct permission.");

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "access.permission.cleared",
          entity: "user",
          entityId: userId,
          metadata: { permissionKey },
        },
      });
    });
  }

  /** Staff list for the users screen, with each person's roles. */
  async listUsers() {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const users = await tx.user.findMany({
        where: { deletedAt: null },
        include: {
          userRoles: { include: { role: true, branch: true } },
          userPermissions: true,
        },
        orderBy: { email: "asc" },
      });

      return users.map((user) => ({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        failedLoginAttempts: user.failedLoginAttempts,
        lockedUntil:
          user.lockedUntil && user.lockedUntil > new Date()
            ? user.lockedUntil.toISOString()
            : null,
        roles: user.userRoles.map((assignment) => ({
          roleId: assignment.roleId,
          name: assignment.role.name,
          branchCode: assignment.branch?.code ?? null,
          expiresAt: assignment.expiresAt?.toISOString() ?? null,
        })),
        directCount: user.userPermissions.length,
        denyCount: user.userPermissions.filter((grant) => grant.effect === "DENY").length,
      }));
    });
  }

  /**
   * Clears a lockout.
   *
   * Needed because a lockoutMinutes of 0 means "until an administrator unlocks
   * it" — without this endpoint that setting would be a way to lock a client out
   * of its own account permanently.
   */
  async unlockUser(userId: string): Promise<void> {
    const { clientId, actor } = requireRequestContext();

    await this.prisma.forClient(clientId!, async (tx) => {
      const user = await tx.user.findFirst({ where: { id: userId, deletedAt: null } });
      if (!user) throw new NotFoundException("User not found.");

      await tx.user.update({
        where: { id: userId },
        data: { lockedUntil: null, failedLoginAttempts: 0 },
      });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "auth.account.unlocked",
          entity: "user",
          entityId: userId,
          metadata: { email: user.email, clearedAttempts: user.failedLoginAttempts },
        },
      });
    });
  }

  /** Branches, for scoping a role assignment. */
  async listBranches() {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const branches = await tx.branch.findMany({
        where: { deletedAt: null },
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true },
      });
      return branches;
    });
  }

  /** Everything about one person's access, for an administration screen. */
  async describeUserAccess(userId: string) {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: userId, deletedAt: null },
        include: {
          userRoles: { include: { role: true, branch: true } },
          userPermissions: true,
        },
      });
      if (!user) throw new NotFoundException("User not found.");

      return {
        user: { id: user.id, email: user.email, fullName: user.fullName, isActive: user.isActive },
        roles: user.userRoles.map((assignment) => ({
          roleId: assignment.roleId,
          name: assignment.role.name,
          branch: assignment.branch ? { id: assignment.branch.id, code: assignment.branch.code } : null,
          expiresAt: assignment.expiresAt?.toISOString() ?? null,
        })),
        direct: user.userPermissions.map((grant) => ({
          permission: grant.permissionKey,
          effect: grant.effect,
          reason: grant.reason,
          expiresAt: grant.expiresAt?.toISOString() ?? null,
        })),
      };
    });
  }
}
