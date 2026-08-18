import { BadRequestException, Body, Controller, Get, HttpCode, Put } from "@nestjs/common";
import { POLICY_LIMITS } from "@excelex/permissions";
import { z } from "zod";

import { Can, RequirePermission } from "../auth/auth.guard";
import { ClientSettingsService } from "./client-settings.service";
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

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    // An emptied field means "not set", not an empty string. Storing "" makes
    // every downstream `?? fallback` miss.
    .transform((value) => (value ? value : null));

const upperOptional = (max: number, pattern: RegExp, message: string) =>
  optionalText(max).refine((value) => value === null || pattern.test(value.toUpperCase()), {
    message,
  });

const clientSettingsSchema = z.object({
  legalName: z.string().trim().min(2, "A legal name is required.").max(160),
  tradingName: optionalText(160),
  gstin: upperOptional(15, /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "That is not a valid GSTIN."),
  pan: upperOptional(10, /^[A-Z]{5}[0-9]{4}[A-Z]$/, "That is not a valid PAN."),
  cin: upperOptional(21, /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/, "That is not a valid CIN."),
  supportEmail: optionalText(320).refine(
    (value) => value === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
    { message: "That is not a valid email address." },
  ),
  supportPhone: optionalText(32),
  websiteUrl: optionalText(200).refine(
    (value) => value === null || /^https?:\/\//.test(value),
    { message: "A website URL must start with http:// or https://." },
  ),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(80),
  stateCode: optionalText(10),
  countryCode: z.string().trim().length(2).toUpperCase(),
  postalCode: optionalText(16),
  timezone: z.string().trim().min(1).max(64),
  currency: z.string().trim().length(3).toUpperCase(),
  dateFormat: z.enum(["dd/MM/yyyy", "dd-MM-yyyy", "yyyy-MM-dd", "MM/dd/yyyy"]),
  weekStart: z.coerce.number().int().min(1).max(7),
  invoicePrefix: optionalText(12),
  invoiceFooter: optionalText(500),
  termsText: optionalText(2000),
});

@Controller({ path: "settings", version: "1" })
export class SettingsController {
  constructor(
    private readonly passwordPolicy: PasswordPolicyService,
    private readonly security: SecuritySettingsService,
    private readonly general: ClientSettingsService,
  ) {}

  @Get("general")
  @Can("clientSettings", "view")
  viewGeneral() {
    return this.general.view();
  }

  @Put("general")
  @Can("clientSettings", "update")
  @HttpCode(204)
  async updateGeneral(@Body() body: unknown): Promise<void> {
    const result = clientSettingsSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.issues.map((issue) => issue.message));
    }

    // Statutory identifiers are stored uppercase so a lookup never has to guess.
    await this.general.update({
      ...result.data,
      gstin: result.data.gstin?.toUpperCase() ?? null,
      pan: result.data.pan?.toUpperCase() ?? null,
      cin: result.data.cin?.toUpperCase() ?? null,
    });
  }

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
