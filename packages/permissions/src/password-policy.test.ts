import { describe, expect, it } from "vitest";

import {
  DEFAULT_PASSWORD_POLICY,
  evaluatePassword,
  isPasswordAcceptable,
  passwordViolations,
  type PasswordPolicy,
} from "./password-policy";

function policy(overrides: Partial<PasswordPolicy> = {}): PasswordPolicy {
  return { ...DEFAULT_PASSWORD_POLICY, ...overrides };
}

describe("evaluatePassword", () => {
  it("only lists rules the policy actually turns on", () => {
    const rules = evaluatePassword(policy(), "anything");
    expect(rules.map((rule) => rule.id)).toEqual(["length"]);
  });

  it("lists every enabled rule", () => {
    const rules = evaluatePassword(
      policy({
        requireUppercase: true,
        requireLowercase: true,
        requireNumber: true,
        requireSpecial: true,
      }),
      "",
    );

    expect(rules.map((rule) => rule.id)).toEqual([
      "length",
      "uppercase",
      "lowercase",
      "number",
      "special",
    ]);
  });

  it("reports every unmet rule at once, not just the first", () => {
    // Refusing one rule at a time is how people end up writing passwords down.
    const violations = passwordViolations(
      policy({ minLength: 12, requireUppercase: true, requireNumber: true }),
      "short",
    );

    expect(violations).toHaveLength(3);
  });

  it("states the configured minimum in the message", () => {
    expect(passwordViolations(policy({ minLength: 8 }), "abc")[0]).toBe("At least 8 characters");
    expect(passwordViolations(policy({ minLength: 14 }), "abc")[0]).toBe("At least 14 characters");
  });
});

describe("isPasswordAcceptable", () => {
  it("accepts at exactly the minimum length", () => {
    expect(isPasswordAcceptable(policy({ minLength: 8 }), "abcdefgh")).toBe(true);
    expect(isPasswordAcceptable(policy({ minLength: 8 }), "abcdefg")).toBe(false);
  });

  it("accepts a long passphrase with no symbols under the default policy", () => {
    // The default deliberately favours length over composition; this is the case
    // that forced-symbol policies get wrong.
    expect(isPasswordAcceptable(policy(), "correct horse battery staple")).toBe(true);
  });

  it("enforces character classes when a client turns them on", () => {
    const strict = policy({
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumber: true,
      requireSpecial: true,
    });

    expect(isPasswordAcceptable(strict, "alllowercase1!")).toBe(false);
    expect(isPasswordAcceptable(strict, "ALLUPPERCASE1!")).toBe(false);
    expect(isPasswordAcceptable(strict, "NoDigitsHere!")).toBe(false);
    expect(isPasswordAcceptable(strict, "NoSymbol1234")).toBe(false);
    expect(isPasswordAcceptable(strict, "Passw0rd!")).toBe(true);
  });

  it("counts a range of symbols as special, not only the obvious ones", () => {
    const strict = policy({ minLength: 4, requireSpecial: true });

    for (const symbol of ["!", "@", "#", "$", "%", "^", "&", "*", "-", "_", "?", "~"]) {
      expect(isPasswordAcceptable(strict, `abcd${symbol}`)).toBe(true);
    }
    expect(isPasswordAcceptable(strict, "abcdefgh")).toBe(false);
  });

  it("counts unicode by code unit, so an emoji password is not silently short", () => {
    // Documenting the behaviour rather than asserting it is ideal: JavaScript
    // string length counts UTF-16 code units, so a 4-emoji password reads as 8.
    expect("👍👍👍👍".length).toBe(8);
    expect(isPasswordAcceptable(policy({ minLength: 8 }), "👍👍👍👍")).toBe(true);
  });
});
