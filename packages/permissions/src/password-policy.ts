/**
 * Password policy: the rules, and the pure function that applies them.
 *
 * Kept here rather than in the API because the same rules must produce the same
 * answer in three places — the change-password endpoint, the live checklist in
 * the browser, and the tests. Three implementations of "is this password
 * acceptable" is three chances for the UI to promise something the server
 * refuses.
 *
 * A note on the composition rules below. Current NIST guidance (SP 800-63B)
 * recommends length over forced character classes: mandatory symbols mostly
 * produce Password1! and a sticky note, while length is what actually resists
 * guessing. They are offered because many courier clients inherit them from a
 * customer's or insurer's security questionnaire and cannot simply decline —
 * but they are off by default, deliberately.
 */

export interface PasswordPolicy {
  readonly minLength: number;
  readonly requireUppercase: boolean;
  readonly requireLowercase: boolean;
  readonly requireNumber: boolean;
  readonly requireSpecial: boolean;
  /** Refuse a password matching one of the last `historyCount` used. */
  readonly preventReuse: boolean;
  readonly historyCount: number;
  readonly expiryEnabled: boolean;
  readonly expiryDays: number;
  readonly forceChangeOnFirstLogin: boolean;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  requireUppercase: false,
  requireLowercase: false,
  requireNumber: false,
  requireSpecial: false,
  preventReuse: true,
  historyCount: 5,
  expiryEnabled: false,
  expiryDays: 90,
  forceChangeOnFirstLogin: false,
};

/** Bounds the stored policy. A minimum of 1 is not a policy, and Argon2 hashing
 *  an unbounded input is a cheap denial of service. */
export const POLICY_LIMITS = {
  minLength: { min: 6, max: 128 },
  historyCount: { min: 1, max: 24 },
  expiryDays: { min: 1, max: 3650 },
} as const;

export const SPECIAL_CHARACTERS = "!@#$%^&*()_+-=[]{};':\"\\|,.<>/?`~";

export interface PolicyRule {
  readonly id: string;
  readonly label: string;
  readonly satisfied: boolean;
}

/**
 * Evaluates every rule rather than stopping at the first failure, so the caller
 * can show a checklist. Telling someone their password is too short, then that
 * it needs a digit, then that it needs a capital, one refusal at a time, is how
 * people end up writing passwords down.
 */
export function evaluatePassword(policy: PasswordPolicy, password: string): PolicyRule[] {
  const rules: PolicyRule[] = [
    {
      id: "length",
      label: `At least ${policy.minLength} characters`,
      satisfied: password.length >= policy.minLength,
    },
  ];

  if (policy.requireUppercase) {
    rules.push({
      id: "uppercase",
      label: "An uppercase letter",
      satisfied: /[A-Z]/.test(password),
    });
  }
  if (policy.requireLowercase) {
    rules.push({
      id: "lowercase",
      label: "A lowercase letter",
      satisfied: /[a-z]/.test(password),
    });
  }
  if (policy.requireNumber) {
    rules.push({ id: "number", label: "A number", satisfied: /[0-9]/.test(password) });
  }
  if (policy.requireSpecial) {
    rules.push({
      id: "special",
      label: `A special character (${SPECIAL_CHARACTERS.slice(0, 8)}…)`,
      satisfied: [...password].some((character) => SPECIAL_CHARACTERS.includes(character)),
    });
  }

  return rules;
}

/** The messages for a rejection, empty when the password is acceptable. */
export function passwordViolations(policy: PasswordPolicy, password: string): string[] {
  return evaluatePassword(policy, password)
    .filter((rule) => !rule.satisfied)
    .map((rule) => rule.label);
}

export function isPasswordAcceptable(policy: PasswordPolicy, password: string): boolean {
  return passwordViolations(policy, password).length === 0;
}
