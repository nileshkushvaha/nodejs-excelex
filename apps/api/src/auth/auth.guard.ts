import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { permissionFor, resolvePermissions, type Action, type Resource } from "@excelex/permissions";
import type { Request } from "express";

import { attachActor, currentRequestContext } from "../core/context/request-context";
import { AuthService } from "./auth.service";
import { SessionService } from "./session.service";

export const PUBLIC_ROUTE = "excelex:publicRoute";
export const REQUIRED_PERMISSION = "excelex:requiredPermission";

/** Opt a route out of authentication. Explicit, so forgetting is not the default. */
export const PublicRoute = () => SetMetadata(PUBLIC_ROUTE, true);

/**
 * Require a permission outright.
 *
 * Kept for the routes that are not CRUD on a master — signing out, changing
 * your own password, reading the permission catalogue. Anything that is an
 * action on a resource should use `@Can` instead, so the rule lives in the
 * policy table rather than in a string here.
 */
export const RequirePermission = (permission: string) =>
  SetMetadata(REQUIRED_PERMISSION, permission);

/**
 * Require the permission the policy table gives this action.
 *
 * `@Can("customer", "delete")` reads as the question being asked, and moves
 * the answer to one table that the browser consults too. A typo is a compile
 * error rather than a route that silently requires a permission nobody holds
 * — which is what `@RequirePermission("masters.custmer.manage")` would be.
 */
export const Can = (resource: Resource, action: Action) =>
  SetMetadata(REQUIRED_PERMISSION, permissionFor(resource, action));

/**
 * Authentication and authorization, applied globally.
 *
 * Global by default and opted out by decorator, rather than applied per route:
 * a developer who forgets the decorator gets a locked endpoint, not an open one.
 * That asymmetry is the entire point.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requestContext = currentRequestContext();
    if (!requestContext?.clientId) {
      throw new UnauthorizedException("This route requires a client host.");
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = request.cookies?.[this.sessions.cookieName] as string | undefined;
    if (!token) throw new UnauthorizedException("Not signed in.");

    const actor = await this.auth.authenticate(requestContext.clientId, token);
    if (!actor) throw new UnauthorizedException("Session expired or revoked.");

    const required = this.reflector.getAllAndOverride<string>(REQUIRED_PERMISSION, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Resolved rather than matched against the expanded list: the resolver is
    // the single authority on precedence, so a DENY cannot be lost by whichever
    // caller happened to expand the list.
    if (required && !resolvePermissions(actor.grants).has(required)) {
      throw new ForbiddenException(`Missing permission: ${required}`);
    }

    attachActor(actor);
    return true;
  }
}
