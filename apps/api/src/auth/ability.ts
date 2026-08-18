import { ForbiddenException } from "@nestjs/common";
import { permissionFor, resolvePermissions, type Action, type Resource } from "@excelex/permissions";

import { currentActor } from "../core/context/request-context";

/**
 * The Gate.
 *
 * `can` answers a question, `authorize` insists on the answer. Both read the
 * actor from the request context, so a service deep in a call stack can ask
 * without being handed a user object through four signatures it otherwise
 * does not need.
 *
 * This is not a replacement for the route guard. The guard is the boundary;
 * this is for the decisions the boundary cannot make — a method reached from
 * more than one route, a rule that depends on the row, or an action taken on
 * behalf of a user by something that is not an HTTP request at all. Laravel
 * calls the same split middleware and Gate, and needs both for the same
 * reason.
 *
 * A branchId narrows the question: a role granted for one branch answers yes
 * there and no elsewhere. Omitting it asks whether the permission is held
 * anywhere, which is the right question for a client-wide screen and the
 * wrong one for a booking.
 */
export interface AbilityOptions {
  readonly branchId?: string;
}

/** Whether the current actor may take this action on this resource. */
export function can(resource: Resource, action: Action, options: AbilityOptions = {}): boolean {
  return holds(permissionFor(resource, action), options);
}

export function cannot(resource: Resource, action: Action, options: AbilityOptions = {}): boolean {
  return !can(resource, action, options);
}

/** Throws unless the actor may take the action. The message names the rule. */
export function authorize(resource: Resource, action: Action, options: AbilityOptions = {}): void {
  if (can(resource, action, options)) return;

  throw new ForbiddenException(
    `Missing permission: ${permissionFor(resource, action)} (${String(resource)}.${action})`,
  );
}

/** Whether the actor holds a permission outright, for rules with no resource. */
export function holds(permission: string, options: AbilityOptions = {}): boolean {
  const actor = currentActor();
  // No actor means no request, or an unauthenticated one. Answering "no" is
  // the only safe reading: a background job that needs to act without a user
  // must say so explicitly rather than inherit an empty context as consent.
  if (!actor) return false;

  return resolvePermissions(actor.grants, { branchId: options.branchId }).has(permission);
}
