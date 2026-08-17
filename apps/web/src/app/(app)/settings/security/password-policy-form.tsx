"use client";

import { useActionState, useState } from "react";

import { Toggle } from "@/components/toggle";
import type { ActionResult, PasswordPolicy } from "@/lib/api";
import { savePasswordPolicy } from "./actions";

const numberField =
  "w-24 rounded border border-line-strong px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:bg-surface-2 disabled:text-faint";

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card rounded-xl">
      <div className="border-b border-line px-5 py-3">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

/** Marks a control whose value is stored but not yet acted on. */
function NotEnforced() {
  return (
    <p className="rounded border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/50 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300">
      Saved, but <strong>not yet enforced</strong> — enforcement needs the forced-change flow that
      arrives with invitations.
    </p>
  );
}

export function PasswordPolicyForm({
  policy,
  canManage,
}: {
  policy: PasswordPolicy;
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState(savePasswordPolicy, null);
  const [preventReuse, setPreventReuse] = useState(policy.preventReuse);
  const [expiryEnabled, setExpiryEnabled] = useState(policy.expiryEnabled);

  return (
    <form action={action} className="space-y-5">
      {state?.ok ? (
        <p role="status" className="rounded border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/50 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">
          Policy saved. It applies to the next password anyone sets.
        </p>
      ) : null}
      {state && !state.ok ? (
        <p role="alert" className="rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {state.error}
        </p>
      ) : null}

      {!canManage ? (
        <p className="rounded border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
          You can read this policy but not change it. Changing it needs{" "}
          <code className="font-mono">settings.security.manage</code>.
        </p>
      ) : null}

      <Card
        title="Password rules"
        description="Applied whenever someone sets or changes their password."
      >
        <div className="flex items-center gap-2">
          <label htmlFor="minLength" className="text-sm font-medium text-fg">
            Minimum length
          </label>
          <input
            id="minLength"
            name="minLength"
            type="number"
            min={6}
            max={128}
            required
            disabled={!canManage}
            defaultValue={policy.minLength}
            className={numberField}
          />
          <span className="text-sm text-muted">characters</span>
        </div>

        <div className="space-y-3 border-t border-line-soft pt-4">
          <Toggle
            name="requireUppercase"
            label="Require an uppercase letter"
            defaultChecked={policy.requireUppercase}
            disabled={!canManage}
          />
          <Toggle
            name="requireLowercase"
            label="Require a lowercase letter"
            defaultChecked={policy.requireLowercase}
            disabled={!canManage}
          />
          <Toggle
            name="requireNumber"
            label="Require a number"
            defaultChecked={policy.requireNumber}
            disabled={!canManage}
          />
          <Toggle
            name="requireSpecial"
            label="Require a special character"
            description="! @ # $ % ^ &amp; *"
            defaultChecked={policy.requireSpecial}
            disabled={!canManage}
          />
        </div>

        <p className="rounded border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
          These are off by default on purpose. Current NIST guidance favours length over forced
          character classes — mandatory symbols mostly produce <code>Password1!</code> and a sticky
          note. They are here because many clients inherit them from a customer&apos;s or
          insurer&apos;s security questionnaire and cannot simply decline.
        </p>
      </Card>

      <Card title="Password history" description="Stop people cycling back to an old password.">
        <Toggle
          name="preventReuse"
          label="Prevent password reuse"
          defaultChecked={policy.preventReuse}
          disabled={!canManage}
          onChange={setPreventReuse}
        />

        <div className="flex items-center gap-2">
          <label htmlFor="historyCount" className="text-sm font-medium text-fg">
            Remember the last
          </label>
          <input
            id="historyCount"
            name="historyCount"
            type="number"
            min={1}
            max={24}
            required
            disabled={!canManage || !preventReuse}
            defaultValue={policy.historyCount}
            className={numberField}
          />
          <span className="text-sm text-muted">passwords</span>
        </div>
        <p className="text-xs text-muted">
          Only hashes are kept, and the list is pruned to this number on every change — an unbounded
          history of someone&apos;s old credentials is a liability that grows for as long as they
          work here.
        </p>
      </Card>

      <Card title="Password expiry" description="Force a change periodically.">
        <Toggle
          name="expiryEnabled"
          label="Expire passwords"
          defaultChecked={policy.expiryEnabled}
          disabled={!canManage}
          onChange={setExpiryEnabled}
        />

        <div className="flex items-center gap-2">
          <label htmlFor="expiryDays" className="text-sm font-medium text-fg">
            Expire after
          </label>
          <input
            id="expiryDays"
            name="expiryDays"
            type="number"
            min={1}
            max={3650}
            required
            disabled={!canManage || !expiryEnabled}
            defaultValue={policy.expiryDays}
            className={numberField}
          />
          <span className="text-sm text-muted">days</span>
        </div>

        {expiryEnabled ? <NotEnforced /> : null}
      </Card>

      <Card
        title="First sign-in"
        description="What happens the first time an invited person signs in."
      >
        <Toggle
          name="forceChangeOnFirstLogin"
          label="Force a password change on first sign-in"
          description="Applies to accounts an administrator creates."
          defaultChecked={policy.forceChangeOnFirstLogin}
          disabled={!canManage}
        />
        <NotEnforced />
      </Card>

      {canManage ? (
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save policy"}
          </button>
          {policy.updatedAt ? (
            <span className="text-xs text-muted">
              Last changed{" "}
              {new Date(policy.updatedAt).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          ) : (
            <span className="text-xs text-muted">Never changed — showing defaults.</span>
          )}
        </div>
      ) : null}
    </form>
  );
}
