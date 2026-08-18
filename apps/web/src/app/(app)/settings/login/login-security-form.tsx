"use client";

import { useActionState, useState } from "react";

import { NotEnforced, SaveBar, SettingsCard, numberField } from "@/components/settings-card";
import { Toggle } from "@/components/toggle";
import type { ActionResult, SecuritySettings } from "@/lib/api";
import { saveLoginSecurity } from "./actions";

function Feedback({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return state.ok ? (
    <p role="status" className="rounded border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/50 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
      Settings saved.
    </p>
  ) : (
    <p role="alert" className="rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 px-3 py-2 text-sm text-red-700 dark:text-red-300">
      {state.error}
    </p>
  );
}

export function LoginSecurityForm({
  settings,
  canManage,
}: {
  settings: SecuritySettings;
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState(saveLoginSecurity, null);
  const [locking, setLocking] = useState(settings.lockAfterFailedAttempts);
  const [lockoutMinutes, setLockoutMinutes] = useState(settings.lockoutMinutes);

  return (
    <form action={action} className="space-y-5">
      <Feedback state={state} />

      <SettingsCard
        title="Account lockout"
        description="Automatically lock an account after repeated failed sign-ins."
      >
        <Toggle
          name="lockAfterFailedAttempts"
          label="Lock accounts after repeated failures"
          defaultChecked={settings.lockAfterFailedAttempts}
          disabled={!canManage}
          onChange={setLocking}
        />

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="maxFailedAttempts" className="text-sm font-medium text-fg">
            Lock after
          </label>
          <input
            id="maxFailedAttempts"
            name="maxFailedAttempts"
            type="number"
            min={1}
            max={100}
            required
            disabled={!canManage || !locking}
            defaultValue={settings.maxFailedAttempts}
            className={numberField}
          />
          <span className="text-sm text-muted">consecutive failures</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="lockoutMinutes" className="text-sm font-medium text-fg">
            Stay locked for
          </label>
          <input
            id="lockoutMinutes"
            name="lockoutMinutes"
            type="number"
            min={0}
            max={10080}
            required
            disabled={!canManage || !locking}
            defaultValue={settings.lockoutMinutes}
            onChange={(event) => setLockoutMinutes(Number(event.target.value))}
            className={numberField}
          />
          <span className="text-sm text-muted">minutes</span>
        </div>

        <p className="text-xs text-muted">
          {lockoutMinutes === 0 ? (
            <span className="text-amber-700 dark:text-amber-300">
              0 means the account stays locked until an administrator unlocks it from the Users
              screen.
            </span>
          ) : (
            "The counter resets on any successful sign-in, so this locks an account that failed repeatedly in a row — not one that has simply been used for a long time."
          )}
        </p>

        <p className="rounded border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
          A locked account is only reported as locked once the correct password is given. Saying so
          earlier would confirm the address exists to anyone willing to guess wrong a few times,
          turning the lockout into an enumeration oracle — the opposite of what it is for.
        </p>
      </SettingsCard>

      <SettingsCard
        title="Rate limiting"
        description="Throttle sign-in and password-reset requests to slow automated attacks."
      >
        <Toggle
          name="loginThrottleEnabled"
          label="Throttle sign-in attempts per email address"
          defaultChecked={settings.loginThrottleEnabled}
          disabled={!canManage}
        />
        <p className="text-xs text-muted">
          Enforced. With this on, more than ten attempts against one email address in five minutes
          are refused for the rest of the window — including addresses that do not exist, which the
          lockout above can never protect. Refused attempts appear in Login history as
          &ldquo;Throttled&rdquo;. A per-address limit for the whole deployment applies regardless of
          this switch.
        </p>
        <Toggle
          name="resetThrottleEnabled"
          label="Throttle password-reset requests"
          defaultChecked={settings.resetThrottleEnabled}
          disabled={!canManage}
        />
        <NotEnforced reason="there is no password-reset endpoint yet; the switch will apply to it when it lands." />
      </SettingsCard>

      <SettingsCard
        title="Notifications"
        description="Alert people when suspicious sign-in activity is detected."
      >
        <Toggle
          name="notifyUserOnFailedAttempts"
          label="Email the account owner on a failed sign-in"
          description="Noisy on shared terminals — most clients leave this off and rely on the lockout notice."
          defaultChecked={settings.notifyUserOnFailedAttempts}
          disabled={!canManage}
        />
        <Toggle
          name="notifyUserOnLock"
          label="Email the account owner when their account is locked"
          defaultChecked={settings.notifyUserOnLock}
          disabled={!canManage}
        />
        <Toggle
          name="notifyAdminOnLock"
          label="Email an administrator when any account is locked"
          defaultChecked={settings.notifyAdminOnLock}
          disabled={!canManage}
        />
        <NotEnforced reason="there is no mail transport yet. Every event below is already written to the audit trail, so nothing is lost in the meantime." />
      </SettingsCard>

      <SaveBar pending={pending} updatedAt={settings.updatedAt} canManage={canManage} />
    </form>
  );
}
