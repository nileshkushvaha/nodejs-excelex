import { BadRequestException, Body, Controller, Get, HttpCode, Put } from "@nestjs/common";
import { POLICY_LIMITS } from "@excelex/permissions";
import { z } from "zod";

import { RequirePermission } from "../auth/auth.guard";
import { PasswordPolicyService } from "./password-policy.service";
import { SecuritySettingsService } from "./security-settings.service";

const passwordPolicySchema = z.object({
  minLength: z.coerce
    .number()
    .int()
    .min(POLICY_LIMITS.minLength.min, `Minimum length cannot be below ${POLICY_LIMITS.minLength.min}.`)
    .max(POLICY_LIMITS.minLength.max),
  requireUppercase: z.coerce.boolean(),
  requireLowercase: z.coerce.boolean(),
  requireNumber: z.coerce.boolean(),
  requireSpecial: z.coerce.boolean(),
  preventReuse: z.coerce.boolean(),
  historyCount: z.coerce
    .number()
    .int()
    .min(POLICY_LIMITS.historyCount.min)
    .max(POLICY_LIMITS.historyCount.max),
  expiryEnabled: z.coerce.boolean(),
  expiryDays: z.coerce
    .number()
    .int()
    .min(POLICY_LIMITS.expiryDays.min)
    .max(POLICY_LIMITS.expiryDays.max),
  forceChangeOnFirstLogin: z.coerce.boolean(),
});

const securitySettingsSchema = z.object({
  lockAfterFailedAttempts: z.coerce.boolean(),
  maxFailedAttempts: z.coerce.number().int().min(1).max(100),
  /// 0 means "until an administrator unlocks it".
  lockoutMinutes: z.coerce.number().int().min(0).max(10080),
  idleTimeoutMinutes: z.coerce.number().int().min(1, "An idle timeout of 0 would never expire.").max(10080),
  absoluteTimeoutHours: z.coerce.number().int().min(1).max(720),
  allowMultipleSessions: z.coerce.boolean(),
  forceLogoutOnPasswordChange: z.coerce.boolean(),
  loginThrottleEnabled: z.coerce.boolean(),
  resetThrottleEnabled: z.coerce.boolean(),
  notifyUserOnFailedAttempts: z.coerce.boolean(),
  notifyUserOnLock: z.coerce.boolean(),
  notifyAdminOnLock: z.coerce.boolean(),
});

@Controller({ path: "settings", version: "1" })
export class SettingsController {
  constructor(
    private readonly passwordPolicy: PasswordPolicyService,
    private readonly security: SecuritySettingsService,
  ) {}

  /**
   * Readable with settings.security.view, but also by anyone who needs it to
   * change their own password — the profile screen shows the live checklist, and
   * a rule the user cannot read is a rule they can only discover by failing.
   */
  @Get("password-policy")
  view() {
    return this.passwordPolicy.view();
  }

  @Put("password-policy")
  @RequirePermission("settings.security.manage")
  @HttpCode(204)
  async update(@Body() body: unknown): Promise<void> {
    const result = passwordPolicySchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.issues.map((issue) => issue.message));
    }

    await this.passwordPolicy.update(result.data);
  }

  @Get("security")
  @RequirePermission("settings.security.view")
  viewSecurity() {
    return this.security.view();
  }

  @Put("security")
  @RequirePermission("settings.security.manage")
  @HttpCode(204)
  async updateSecurity(@Body() body: unknown): Promise<void> {
    const result = securitySettingsSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.issues.map((issue) => issue.message));
    }

    await this.security.update(result.data);
  }
}
