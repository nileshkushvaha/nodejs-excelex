import { Injectable } from "@nestjs/common";

import { requireRequestContext } from "../core/context/request-context";
import { PrismaService } from "../core/database/prisma.service";

export interface SecuritySettings {
  lockAfterFailedAttempts: boolean;
  maxFailedAttempts: number;
  lockoutMinutes: number;
  idleTimeoutMinutes: number;
  absoluteTimeoutHours: number;
  allowMultipleSessions: boolean;
  forceLogoutOnPasswordChange: boolean;
  loginThrottleEnabled: boolean;
  resetThrottleEnabled: boolean;
  notifyUserOnFailedAttempts: boolean;
  notifyUserOnLock: boolean;
  notifyAdminOnLock: boolean;
}

export interface SecuritySettingsView extends SecuritySettings {
  updatedAt: string | null;
}

/**
 * Defaults for a client that has never configured anything. Chosen to be
 * defensible rather than permissive: five attempts and a fifteen-minute lockout
 * stops credential stuffing without locking out someone with caps lock on for
 * the rest of the day.
 */
export const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  lockAfterFailedAttempts: true,
  maxFailedAttempts: 5,
  lockoutMinutes: 15,
  idleTimeoutMinutes: 60,
  absoluteTimeoutHours: 12,
  allowMultipleSessions: true,
  forceLogoutOnPasswordChange: true,
  loginThrottleEnabled: true,
  resetThrottleEnabled: true,
  notifyUserOnFailedAttempts: false,
  notifyUserOnLock: true,
  notifyAdminOnLock: false,
};

@Injectable()
export class SecuritySettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Merges a stored row over the defaults, for use inside an existing transaction. */
  static toSettings(row: Partial<SecuritySettings> | null | undefined): SecuritySettings {
    return row ? { ...DEFAULT_SECURITY_SETTINGS, ...row } : DEFAULT_SECURITY_SETTINGS;
  }

  async view(): Promise<SecuritySettingsView> {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.securitySettings.findFirst();
      return {
        ...SecuritySettingsService.toSettings(row),
        updatedAt: row?.updatedAt.toISOString() ?? null,
      };
    });
  }

  async update(settings: SecuritySettings): Promise<void> {
    const { clientId, actor } = requireRequestContext();

    await this.prisma.forClient(clientId!, async (tx) => {
      const before = await tx.securitySettings.findFirst();
      const data = { ...settings, updatedById: actor?.userId ?? null };

      if (before) {
        await tx.securitySettings.update({ where: { id: before.id }, data });
      } else {
        await tx.securitySettings.create({ data: { ...data, clientId: clientId! } });
      }

      const previous = SecuritySettingsService.toSettings(before);
      const changes: Record<string, { from: unknown; to: unknown }> = {};

      for (const key of Object.keys(settings) as Array<keyof SecuritySettings>) {
        if (previous[key] !== settings[key]) {
          changes[key] = { from: previous[key], to: settings[key] };
        }
      }

      if (Object.keys(changes).length > 0) {
        await tx.auditEvent.create({
          data: {
            clientId: clientId!,
            actorId: actor?.userId ?? null,
            action: "settings.security.updated",
            entity: "security_settings",
            metadata: changes,
          },
        });
      }
    });
  }
}
