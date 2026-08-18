import { hashPassword, verifyPassword } from "@excelex/database";
import { passwordViolations } from "@excelex/permissions";

import { ValidationError } from "../core/errors/app-error";
import { PasswordPolicyService } from "../settings/password-policy.service";

/**
 * Setting a password, wherever it is set from.
 *
 * A change from the profile screen and a reset from a mailed code arrive by
 * different doors and must obey the same rules: the client's policy, no
 * reuse within the history the policy names, and the old hash kept and
 * pruned. One function, called inside the caller's transaction, so the two
 * paths cannot drift — a reset that let a person pick a password the policy
 * would have refused would be the weakest door into every account.
 *
 * Throws a ValidationError on `newPassword` with every unmet rule at once:
 * refusing one rule at a time is how people end up with a password on a
 * sticky note.
 */
interface PasswordTx {
  passwordPolicy: { findFirst: () => Promise<unknown> };
  passwordHistory: {
    findMany: (args: unknown) => Promise<Array<{ id: string; passwordHash: string }>>;
    create: (args: unknown) => Promise<unknown>;
    deleteMany: (args: unknown) => Promise<unknown>;
  };
  user: { update: (args: unknown) => Promise<unknown> };
}

export async function applyNewPassword(
  tx: PasswordTx,
  clientId: string,
  user: { id: string; passwordHash: string | null },
  newPassword: string,
): Promise<void> {
  const policy = PasswordPolicyService.toPolicy((await tx.passwordPolicy.findFirst()) as never);

  const violations = passwordViolations(policy, newPassword);
  if (violations.length > 0) {
    throw new ValidationError(
      violations.map((rule) => ({ path: "newPassword", message: `Your password must contain: ${rule.toLowerCase()}`, code: "policy" })),
      "That password does not meet the policy.",
    );
  }

  if (policy.preventReuse) {
    const history = await tx.passwordHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: policy.historyCount,
    });
    // Argon2 salts every hash, so a reused password does not produce a
    // matching digest — each stored hash has to be verified in turn. That
    // cost is why historyCount is bounded rather than unlimited.
    for (const entry of history) {
      if (await verifyPassword(entry.passwordHash, newPassword)) {
        throw new ValidationError(
          [{ path: "newPassword", message: `That password was used recently. Choose one you have not used in your last ${policy.historyCount}.`, code: "reused" }],
          "That password was used recently.",
        );
      }
    }
    if (user.passwordHash && (await verifyPassword(user.passwordHash, newPassword))) {
      throw new ValidationError(
        [{ path: "newPassword", message: "The new password must be different from the current one.", code: "reused" }],
        "The new password must be different from the current one.",
      );
    }
  }

  if (user.passwordHash) {
    await tx.passwordHistory.create({ data: { clientId, userId: user.id, passwordHash: user.passwordHash } });
    // Pruned to the policy: an unbounded list of someone's old credentials
    // is a liability that grows for as long as they work here.
    const stale = await tx.passwordHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      skip: policy.historyCount,
      select: { id: true },
    });
    if (stale.length > 0) {
      await tx.passwordHistory.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
    }
  }

  await tx.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() },
  });
}
