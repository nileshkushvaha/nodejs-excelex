"use client";

import { useActionState, useState } from "react";

import { SaveBar, SettingsCard, numberField } from "@/components/settings-card";
import { Toggle } from "@/components/toggle";
import type { ActionResult, SecuritySettings } from "@/lib/api";
import { saveSessionSettings } from "../login/actions";

function Feedback({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return state.ok ? (
    <p role="status" className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
      Settings saved. They apply to sessions created from now on.
    </p>
  ) : (
    <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {state.error}
    </p>
  );
}

export function SessionSettingsForm({
  settings,
  canManage,
}: {
  settings: SecuritySettings;
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState(saveSessionSettings, null);
  const [multiple, setMultiple] = useState(settings.allowMultipleSessions);

  return (
    <form action={action} className="space-y-5">
      <Feedback state={state} />

      <SettingsCard
        title="Session lifetime"
        description="How long a session survives inactivity, and how long it can live at all."
      >
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="idleTimeoutMinutes" className="text-sm font-medium text-slate-700">
            Sign out after
          </label>
          <input
            id="idleTimeoutMinutes"
            name="idleTimeoutMinutes"
            type="number"
            min={1}
            max={10080}
            required
            disabled={!canManage}
            defaultValue={settings.idleTimeoutMinutes}
            className={numberField}
          />
          <span className="text-sm text-slate-500">minutes of inactivity</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="absoluteTimeoutHours" className="text-sm font-medium text-slate-700">
            End every session after
          </label>
          <input
            id="absoluteTimeoutHours"
            name="absoluteTimeoutHours"
            type="number"
            min={1}
            max={720}
            required
            disabled={!canManage}
            defaultValue={settings.absoluteTimeoutHours}
            className={numberField}
          />
          <span className="text-sm text-slate-500">hours, regardless of activity</span>
        </div>

        <p className="text-xs text-slate-500">
          There is deliberately no &ldquo;never expire&rdquo; option. The idle window slides forward
          on every request, so an operator working a full shift is not interrupted — what it ends is
          a session left open on an unattended terminal.
        </p>
      </SettingsCard>

      <SettingsCard
        title="Devices"
        description="How many places one account may be signed in at once."
      >
        <Toggle
          name="allowMultipleSessions"
          label="Allow signing in on several devices"
          defaultChecked={settings.allowMultipleSessions}
          disabled={!canManage}
          onChange={setMultiple}
        />
        {!multiple ? (
          <p className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
            With this off, signing in anywhere ends every other session for that account. Shared
            branch terminals are the usual reason to leave it on.
          </p>
        ) : null}

        <Toggle
          name="forceLogoutOnPasswordChange"
          label="End other sessions when someone changes their password"
          description="Recommended. A password change is what people do when they think they have been compromised."
          defaultChecked={settings.forceLogoutOnPasswordChange}
          disabled={!canManage}
        />
      </SettingsCard>

      <SettingsCard
        title="Device management"
        description="Naming, trusting and revoking individual devices."
      >
        <p className="text-sm text-slate-500">
          Not built. Each person can already see and revoke their own active sessions from{" "}
          <a href="/profile" className="text-sky-700 underline">
            My profile
          </a>
          , which covers the same need until then.
        </p>
      </SettingsCard>

      <SaveBar pending={pending} updatedAt={settings.updatedAt} canManage={canManage} />
    </form>
  );
}
