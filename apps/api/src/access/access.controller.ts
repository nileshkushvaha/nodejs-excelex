import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { z } from "zod";

import { Can, RequirePermission } from "../auth/auth.guard";
import { AccessService } from "./access.service";
import { parseOrThrow } from "../core/errors/validation";

const permissionList = z.array(z.string().min(1).max(120)).max(200);

const createRoleSchema = z.object({
  name: z.string().trim().min(2, "A role needs a name.").max(60),
  description: z.string().trim().max(300).nullish(),
  permissions: permissionList.default([]),
});

const setPermissionsSchema = z.object({ permissions: permissionList });

const assignRoleSchema = z.object({
  roleId: z.string().uuid(),
  /** null means client-wide. */
  branchId: z.string().uuid().nullish(),
  expiresAt: z.coerce.date().nullish(),
});

const directPermissionSchema = z.object({
  permission: z.string().min(1).max(120),
  effect: z.enum(["ALLOW", "DENY"]),
  reason: z.string().trim().max(300).nullish(),
  expiresAt: z.coerce.date().nullish(),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = parseOrThrow(schema, body);
  return result;
}

@Controller({ path: "access", version: "1" })
export class AccessController {
  constructor(private readonly access: AccessService) {}

  @Get("permissions")
  @RequirePermission("settings.role.view")
  catalogue() {
    return this.access.catalogue();
  }

  @Get("roles")
  @Can("role", "view")
  listRoles() {
    return this.access.listRoles();
  }

  @Post("roles")
  @Can("role", "create")
  createRole(@Body() body: unknown) {
    const data = parse(createRoleSchema, body);
    return this.access.createRole(data.name, data.description ?? null, data.permissions);
  }

  @Put("roles/:roleId/permissions")
  @Can("role", "update")
  setRolePermissions(@Param("roleId", ParseUUIDPipe) roleId: string, @Body() body: unknown) {
    return this.access.setRolePermissions(roleId, parse(setPermissionsSchema, body).permissions);
  }

  @Delete("roles/:roleId")
  @Can("role", "delete")
  @HttpCode(204)
  async deleteRole(@Param("roleId", ParseUUIDPipe) roleId: string) {
    await this.access.deleteRole(roleId);
  }

  @Get("users")
  @Can("user", "view")
  listUsers() {
    return this.access.listUsers();
  }

  @Get("branches")
  @RequirePermission("masters.branch.view")
  listBranches() {
    return this.access.listBranches();
  }

  @Get("users/:userId")
  @Can("user", "view")
  describeUser(@Param("userId", ParseUUIDPipe) userId: string) {
    return this.access.describeUserAccess(userId);
  }

  @Post("users/:userId/unlock")
  @Can("user", "create")
  @HttpCode(204)
  async unlockUser(@Param("userId", ParseUUIDPipe) userId: string): Promise<void> {
    await this.access.unlockUser(userId);
  }

  @Post("users/:userId/roles")
  @Can("user", "create")
  assignRole(@Param("userId", ParseUUIDPipe) userId: string, @Body() body: unknown) {
    const data = parse(assignRoleSchema, body);
    return this.access.assignRole(
      userId,
      data.roleId,
      data.branchId ?? null,
      data.expiresAt ?? null,
    );
  }

  @Delete("users/:userId/roles/:roleId")
  @Can("user", "delete")
  @HttpCode(204)
  async unassignRole(
    @Param("userId", ParseUUIDPipe) userId: string,
    @Param("roleId", ParseUUIDPipe) roleId: string,
    @Query("branchId") branchId?: string,
  ) {
    await this.access.unassignRole(userId, roleId, branchId ?? null);
  }

  /**
   * Direct grants and denials sit behind their own permission, not
   * settings.user.manage. Bypassing roles for one person is a deliberately
   * separate authority from ordinary staff administration.
   */
  @Put("users/:userId/permissions")
  @Can("user", "update")
  @HttpCode(204)
  async setDirectPermission(@Param("userId", ParseUUIDPipe) userId: string, @Body() body: unknown) {
    const data = parse(directPermissionSchema, body);
    await this.access.setDirectPermission(
      userId,
      data.permission,
      data.effect,
      data.reason ?? null,
      data.expiresAt ?? null,
    );
  }

  @Delete("users/:userId/permissions/:permission")
  @Can("user", "delete")
  @HttpCode(204)
  async clearDirectPermission(
    @Param("userId", ParseUUIDPipe) userId: string,
    @Param("permission") permission: string,
  ) {
    await this.access.clearDirectPermission(userId, permission);
  }
}
