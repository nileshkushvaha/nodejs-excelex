export {
  PERMISSION_DEFINITIONS,
  PERMISSION_KEYS,
  SUPER_PERMISSION,
  isKnownPermission,
  permissionDefinition,
  type PermissionDefinition,
  type PermissionGroup,
  type PermissionKey,
} from "./catalogue";

export {
  expandPermissions,
  permissionMatches,
  resolvePermissions,
  type DirectPermission,
  type GrantSet,
  type PermissionEffect,
  type ResolveOptions,
  type ResolvedPermissions,
  type RoleAssignment,
} from "./resolve";

export { SYSTEM_ROLES, type SystemRoleDefinition } from "./system-roles";
