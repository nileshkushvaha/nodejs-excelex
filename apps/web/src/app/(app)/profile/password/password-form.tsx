"use client";

import { useActionState, useState } from "react";

import { DEFAULT_PASSWORD_POLICY, evaluatePassword } from "@excelex/permissions";

import type { PasswordPolicy } from "@/lib/api";
import { changePassword } from "../actions";
import { Card, Feedback, field } from "../ui";

export function PasswordForm({ policy }: { policy: PasswordPolicy | null }) {
  const [state, action, pending] = useActionState(changePassword, null);
  const [next, setNext] = useState("");

  // The same pure function the API enforces with, so the checklist cannot
  // promise something the server then refuses.
  const rules = evaluatePassword(policy ?? DEFAULT_PASSWORD_POLICY, next);
  const minLength = policy?.minLength ?? DEFAULT_PASSWORD_POLICY.minLength;

  return (
    <Card
      title="Change password"
      description="Changing it signs you out of every other device. That is the point of changing it."
    >
      <form action={action} className="space-y-4">
        <Feedback state={state} okMessage="Password changed. Other sessions were signed out." />

        <div>
          <label htmlFor="currentPassword" className="mb-1 block text-sm font-medium text-fg">
            Current password
          </label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            className={field}
          />
          <p className="mt-1 text-xs text-muted">
            Required even though you are signed in — without it, a stolen session would become a
            stolen account.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="newPassword" className="mb-1 block text-sm font-medium text-fg">
              New password
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={minLength}
              value={next}
              onChange={(event) => setNext(event.target.value)}
              aria-describedby="password-rules"
              className={field}
            />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-fg">
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={minLength}
              className={field}
            />
          </div>
        </div>

        <ul id="password-rules" className="space-y-1">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className={`flex items-center gap-1.5 text-xs ${
                next.length === 0
                  ? "text-muted"
                  : rule.satisfied
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-amber-700 dark:text-amber-400"
              }`}
            >
              <span aria-hidden="true" className="w-3 text-center">
                {next.length === 0 ? "·" : rule.satisfied ? "✓" : "○"}
              </span>
              {rule.label}
            </li>
          ))}
          {policy?.preventReuse ? (
            <li className="flex items-center gap-1.5 text-xs text-muted">
              <span aria-hidden="true" className="w-3 text-center">
                ·
              </span>
              Not one of your last {policy.historyCount} passwords
            </li>
          ) : null}
        </ul>

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
        >
          {pending ? "Changing…" : "Change password"}
        </button>
      </form>
    </Card>
  );
}
