import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";

import { SessionService } from "../auth/session.service";
import { ProfileService } from "./profile.service";

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name.").max(120),
});

/**
 * Shape only. Every rule about what makes an acceptable password — length,
 * character classes, reuse — belongs to the client's password policy and is
 * applied in the service, against the policy row.
 *
 * A minimum here would silently outrank the configured one: a client setting 8
 * would still see 12 enforced, with no indication of which rule refused them.
 * The upper bound stays, because Argon2 hashes whatever it is given and an
 * unbounded input is a cheap denial of service.
 */
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password.").max(1024),
  newPassword: z.string().min(1, "Enter a new password.").max(1024, "That password is too long."),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(result.error.issues.map((issue) => issue.message));
  }
  return result.data;
}

@Controller({ path: "profile", version: "1" })
export class ProfileController {
  constructor(
    private readonly profile: ProfileService,
    private readonly sessions: SessionService,
  ) {}

  // No @RequirePermission anywhere in this controller: the subject and the actor
  // are the same person. Requiring settings.user.manage to change your own
  // password would mean an operator could not.
  @Get()
  view() {
    return this.profile.view();
  }

  @Patch()
  @HttpCode(204)
  async update(@Body() body: unknown): Promise<void> {
    await this.profile.updateProfile(parse(updateProfileSchema, body).fullName);
  }

  @Post("password")
  @HttpCode(204)
  async changePassword(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const data = parse(changePasswordSchema, body);
    const currentToken = (request.cookies as Record<string, string>)[this.sessions.cookieName];

    const issued = await this.profile.changePassword(
      data.currentPassword,
      data.newPassword,
      currentToken ?? "",
    );

    // Every session was revoked, including this one, so the caller is handed a
    // fresh cookie rather than being signed out by their own password change.
    this.sessions.write(response, issued.token, issued.expiresAt);
  }

  @Get("sessions")
  listSessions(@Req() request: Request) {
    const token = (request.cookies as Record<string, string>)[this.sessions.cookieName];
    return this.profile.listSessions(token);
  }

  @Delete("sessions")
  @HttpCode(200)
  async revokeOthers(@Req() request: Request): Promise<{ revoked: number }> {
    const token = (request.cookies as Record<string, string>)[this.sessions.cookieName];
    const revoked = await this.profile.revokeOtherSessions(token ?? "");
    return { revoked };
  }
}
