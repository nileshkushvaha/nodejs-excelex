"use client";

import { useActionState, useState } from "react";

import { evaluatePassword, DEFAULT_PASSWORD_POLICY } from "@excelex/permissions";

import type { ActiveSession, ActionResult, PasswordPolicy, Profile } from "@/lib/api";
import { changePassword, revokeOtherSessions, updateProfile } from "./actions";

const field =
  "w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none transition-colors focus:border-sky-500 focus:ring-2 focus:ring-sky-100";

function Feedback({ state, okMessage }: { state: ActionResult | null; okMessage: string }) {
  if (!state) return null;

  return state.ok ? (
    <p role="status" className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
      {okMessage}
    </p>
  ) : (
    <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {state.error}
    </p>
  );
}

function Card({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="rounded-lg border border-slate-200 bg-white scroll-mt-6">
      <div className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function ProfileForms({
  profile,
  sessions,
  permissions,
  policy,
}: {
  profile: Profile;
  sessions: ActiveSession[];
  permissions: string[];
  policy: PasswordPolicy | null;
}) {
  return (
    <div className="space-y-5">
      <DetailsCard profile={profile} />
      <PasswordCard policy={policy} />
      <SessionsCard sessions={sessions} />
      <PermissionsCard permissions={permissions} />
    </div>
  );
}

function PermissionsCard({ permissions }: { permissions: string[] }) {
  // The resolved answer, not the roles it came from: wildcards are expanded and
  // any denial already removed, so this is exactly what the guard would allow.
  return (
    <Card
      title="What you can do"
      description="Your effective permissions, after roles, wildcards and any denials are resolved."
    >
      {permissions.length === 0 ? (
        <p className="text-sm text-slate-500">No permissions.</p>
      ) : (
        <ul className="flex flex-wrap gap-1">
          {permissions.map((permission) => (
            <li
              key={permission}
              className="rounded bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-700"
            >
              {permission}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function DetailsCard({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState(updateProfile, null);

  return (
    <Card title="Details">
      <form action={action} className="space-y-4">
        <Feedback state={state} okMessage="Profile updated." />

        <div>
          <label htmlFor="fullName" className="mb-1 block text-sm font-medium text-slate-700">
            Full name
          </label>
          <input
            id="fullName"
            name="fullName"
            required
            minLength={2}
            maxLength={120}
            defaultValue={profile.fullName}
            className={field}
          />
        </div>

        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
            Email address
          </label>
          <input
            id="email"
            value={profile.email}
            readOnly
            disabled
            className={`${field} cursor-not-allowed bg-slate-50 text-slate-600`}
          />
          <p className="mt-1 text-xs text-slate-500">
            This is your sign-in identifier, so changing it needs the new address verified first —
            an administrator can change it until that flow exists.
          </p>
        </div>

        <dl className="grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Roles</dt>
            <dd className="mt-0.5 flex flex-wrap gap-1">
              {profile.roles.length === 0 ? (
                <span className="text-slate-400">none</span>
              ) : (
                profile.roles.map((role) => (
                  <span key={role} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                    {role}
                  </span>
                ))
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Branches</dt>
            <dd className="mt-0.5 flex flex-wrap gap-1">
              {profile.branches.length === 0 ? (
                <span className="text-slate-400">none</span>
              ) : (
                profile.branches.map((branch) => (
                  <span
                    key={branch.id}
                    className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700"
                    title={branch.name}
                  >
                    {branch.code}
                  </span>
                ))
              )}
            </dd>
          </div>
        </dl>

        <button
          type="submit"
          disabled={pending}
          className="rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </form>
    </Card>
  );
}

function PasswordCard({ policy }: { policy: PasswordPolicy | null }) {
  const [state, action, pending] = useActionState(changePassword, null);
  const [next, setNext] = useState("");

  // The same pure function the API enforces with, so the checklist cannot
  // promise something the server then refuses.
  const rules = evaluatePassword(policy ?? DEFAULT_PASSWORD_POLICY, next);
  const minLength = policy?.minLength ?? DEFAULT_PASSWORD_POLICY.minLength;

  return (
    <Card
      id="password"
      title="Password"
      description="Changing it signs you out of every other device. That is the point of changing it."
    >
      <form action={action} className="space-y-4">
        <Feedback state={state} okMessage="Password changed. Other sessions were signed out." />

        <div>
          <label htmlFor="currentPassword" className="mb-1 block text-sm font-medium text-slate-700">
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
          <p className="mt-1 text-xs text-slate-500">
            Required even though you are signed in — without it, a stolen session would become a
            stolen account.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="newPassword" className="mb-1 block text-sm font-medium text-slate-700">
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
              aria-describedby="password-hint"
              className={field}
            />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-slate-700">
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

        <ul id="password-hint" className="space-y-1">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className={`flex items-center gap-1.5 text-xs ${
                next.length === 0
                  ? "text-slate-500"
                  : rule.satisfied
                    ? "text-emerald-700"
                    : "text-amber-700"
              }`}
            >
              <span aria-hidden="true" className="w-3 text-center">
                {next.length === 0 ? "·" : rule.satisfied ? "✓" : "○"}
              </span>
              {rule.label}
            </li>
          ))}
          {policy?.preventReuse ? (
            <li className="flex items-center gap-1.5 text-xs text-slate-500">
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
          className="rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:opacity-60"
        >
          {pending ? "Changing…" : "Change password"}
        </button>
      </form>
    </Card>
  );
}

function SessionsCard({ sessions }: { sessions: ActiveSession[] }) {
  const [state, action, pending] = useActionState(
    async (): Promise<ActionResult> => revokeOtherSessions(),
    null,
  );

  const others = sessions.filter((session) => !session.current).length;

  return (
    <Card
      title="Active sessions"
      description="Where this account is currently signed in. Sessions are server-side, so revoking one takes effect immediately."
    >
      <ul className="divide-y divide-slate-100">
        {sessions.map((session) => (
          <li key={session.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm text-slate-800">
                <span className="font-mono text-xs">{session.ip ?? "unknown address"}</span>
                {session.current ? (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-emerald-700">
                    this device
                  </span>
                ) : null}
              </p>
              <p className="truncate text-xs text-slate-500" title={session.userAgent ?? undefined}>
                {session.userAgent ?? "Unknown device"}
              </p>
            </div>
            <time
              dateTime={session.createdAt}
              className="shrink-0 text-xs tabular-nums text-slate-500"
            >
              {new Date(session.createdAt).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </time>
          </li>
        ))}
      </ul>

      {others > 0 ? (
        <form action={action} className="mt-3 border-t border-slate-100 pt-3">
          <Feedback state={state} okMessage="Other sessions signed out." />
          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
          >
            {pending ? "Signing out…" : `Sign out ${others} other ${others === 1 ? "session" : "sessions"}`}
          </button>
        </form>
      ) : (
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          No other active sessions.
        </p>
      )}
    </Card>
  );
}
