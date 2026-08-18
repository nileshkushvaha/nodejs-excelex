import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";

import { requireRequestContext } from "../core/context/request-context";
import { AuthService } from "./auth.service";
import { PublicRoute } from "./auth.guard";
import { SessionService } from "./session.service";
import { parseOrThrow } from "../core/errors/validation";

const signInSchema = z.object({
  email: z.string().trim().min(1, "Enter your email address.").max(320),
  password: z.string().min(1, "Enter your password.").max(1024),
});

@Controller({ path: "auth", version: "1" })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Post("login")
  @PublicRoute()
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: { id: string; email: string; fullName: string; permissions: readonly string[] } }> {
    const parsed = parseOrThrow(signInSchema, body);

    const context = requireRequestContext();
    if (!context.clientId) {
      throw new BadRequestException("Sign-in is only available on a client host.");
    }

    const result = await this.auth.signIn(
      context.clientId,
      context.host,
      parsed.email,
      parsed.password,
      context.ip,
      context.userAgent,
    );

    this.sessions.write(response, result.token, result.expiresAt);

    return {
      user: {
        id: result.actor.userId,
        email: result.actor.email,
        fullName: result.actor.fullName,
        permissions: result.actor.permissions,
      },
    };
  }

  /**
   * Public by design. Signing out must work even when the session has already
   * expired or been revoked — otherwise the one action a worried user takes is
   * the one that fails, and the cookie stays in their browser.
   */
  @Post("logout")
  @PublicRoute()
  @HttpCode(204)
  async logout(@Res({ passthrough: true }) response: Response): Promise<void> {
    const context = requireRequestContext();
    const token = (response.req.cookies as Record<string, string> | undefined)?.[
      this.sessions.cookieName
    ];

    if (context.clientId && token) {
      await this.auth.signOut(context.clientId, token);
    }

    this.sessions.clear(response);
  }

  @Get("me")
  me(): {
    client: { id: string; host: string; status?: string };
    user: { id: string; email: string; fullName: string; permissions: readonly string[] };
  } {
    const context = requireRequestContext();
    const actor = context.actor!;

    return {
      client: { id: context.clientId!, host: context.host, status: context.clientStatus },
      user: {
        id: actor.userId,
        email: actor.email,
        fullName: actor.fullName,
        permissions: actor.permissions,
      },
    };
  }
}
