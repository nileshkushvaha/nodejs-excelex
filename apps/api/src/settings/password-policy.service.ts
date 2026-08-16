import { Injectable } from "@nestjs/common";
import { DEFAULT_PASSWORD_POLICY, type PasswordPolicy } from "@excelex/permissions";

import { requireRequestContext } from "../core/context/request-context";
import { PrismaService } from "../core/database/prisma.service";

export interface PasswordPolicyView extends PasswordPolicy {
  updatedAt: string | null;
}

/**
 * The client's password policy, read and written.
 *
 * A client with no row yet gets the defaults rather than an error: the policy is
 * a setting, and a setting nobody has touched should behave, not fail. The row
 * is created on first write.
 */
@Injectable()
export class PasswordPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  /** For the enforcement path, which already holds a transaction. */
  static toPolicy(row: PasswordPolicy | null | undefined): PasswordPolicy {
    return row ? { ...DEFAULT_PASSWORD_POLICY, ...row } : DEFAULT_PASSWORD_POLICY;
  }

  async view(): Promise<PasswordPolicyView> {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.passwordPolicy.findFirst();

      return {
        ...PasswordPolicyService.toPolicy(row),
        updatedAt: row?.updatedAt.toISOString() ?? null,
      };
    });
  }

  async update(policy: PasswordPolicy): Promise<void> {
    const { clientId, actor } = requireRequestContext();

    await this.prisma.forClient(clientId!, async (tx) => {
      const before = await tx.passwordPolicy.findFirst();
      const data = { ...policy, updatedById: actor?.userId ?? null };

      if (before) {
        await tx.passwordPolicy.update({ where: { id: before.id }, data });
      } else {
        await tx.passwordPolicy.create({ data: { ...data, clientId: clientId! } });
      }

      // Recorded as a diff. "Policy updated" tells a reviewer nothing; "minimum
      // length 12 → 8" is the line an auditor actually asks about.
      const previous = PasswordPolicyService.toPolicy(before);
      const changes: Record<string, { from: unknown; to: unknown }> = {};

      for (const key of Object.keys(policy) as Array<keyof PasswordPolicy>) {
        if (previous[key] !== policy[key]) {
          changes[key] = { from: previous[key], to: policy[key] };
        }
      }

      if (Object.keys(changes).length > 0) {
        await tx.auditEvent.create({
          data: {
            clientId: clientId!,
            actorId: actor?.userId ?? null,
            action: "settings.password_policy.updated",
            entity: "password_policy",
            metadata: changes,
          },
        });
      }
    });
  }
}
