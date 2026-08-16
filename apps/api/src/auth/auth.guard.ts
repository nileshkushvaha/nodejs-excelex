import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import { attachActor, currentRequestContext } from "../core/context/request-context";
import { AuthService } from "./auth.service";
import { SessionService } from "./session.service";

export const PUBLIC_ROUTE = "excelex:publicRoute";
export const REQUIRED_PERMISSION = "excelex:requiredPermission";

/** Opt a route out of authentication. Explicit, so forgetting is not the default. */
export const PublicRoute = () => SetMetadata(PUBLIC_ROUTE, true);

/** Require a permission. The vocabulary becomes a typed constant in packages/permissions. */
export const RequirePermission = (permission: string) =>
  SetMetadata(REQUIRED_PERMISSION, permission);

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
    if (required && !actor.permissions.includes(required)) {
      throw new ForbiddenException(`Missing permission: ${required}`);
    }

    attachActor(actor);
    return true;
  }
}
