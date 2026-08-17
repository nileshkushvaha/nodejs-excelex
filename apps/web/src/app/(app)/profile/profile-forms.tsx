"use client";

import Link from "next/link";
import { useActionState } from "react";

import type { ActiveSession, ActionResult, Profile } from "@/lib/api";
import { revokeOtherSessions, updateProfile } from "./actions";
import { Card, Feedback, field } from "./ui";

export function ProfileForms({
  profile,
  sessions,
  permissions,
}: {
  profile: Profile;
  sessions: ActiveSession[];
  permissions: string[];
}) {
  return (
    <div className="space-y-5">
      <DetailsCard profile={profile} />
      <SessionsCard sessions={sessions} />
      <PermissionsCard permissions={permissions} />
    </div>
  );
}

function DetailsCard({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState(updateProfile, null);

  return (
    <Card title="Details">
      <form action={action} className="space-y-4">
        <Feedback state={state} okMessage="Profile updated." />

        <div>
          <label htmlFor="fullName" className="mb-1 block text-sm font-medium text-fg">
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
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-fg">
            Email address
          </label>
          <input
            id="email"
            value={profile.email}
            readOnly
            disabled
            className={`${field} cursor-not-allowed bg-surface-2`}
          />
          <p className="mt-1 text-xs text-muted">
            This is your sign-in identifier, so changing it needs the new address verified first —
            an administrator can change it until that flow exists.
          </p>
        </div>

        <dl className="grid gap-3 border-t border-line-soft pt-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">Roles</dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {profile.roles.length === 0 ? (
                <span className="text-faint">none</span>
              ) : (
                profile.roles.map((role) => (
                  <span key={role} className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-fg">
                    {role}
                  </span>
                ))
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Branches</dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {profile.branches.length === 0 ? (
                <span className="text-faint">none</span>
              ) : (
                profile.branches.map((branch) => (
                  <span
                    key={branch.id}
                    className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-fg"
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
          className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
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
      <ul className="divide-y divide-line-soft">
        {sessions.map((session) => (
          <li key={session.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm text-fg">
                <span className="font-mono text-xs">{session.ip ?? "unknown address"}</span>
                {session.current ? (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                    this device
                  </span>
                ) : null}
              </p>
              <p className="truncate text-xs text-muted" title={session.userAgent ?? undefined}>
                {session.userAgent ?? "Unknown device"}
              </p>
            </div>
            <time dateTime={session.createdAt} className="shrink-0 text-xs tabular-nums text-muted">
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
        <form action={action} className="mt-3 border-t border-line-soft pt-3">
          <Feedback state={state} okMessage="Other sessions signed out." />
          <button
            type="submit"
            disabled={pending}
            className="mt-2 btn-secondary rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60"
          >
            {pending
              ? "Signing out…"
              : `Sign out ${others} other ${others === 1 ? "session" : "sessions"}`}
          </button>
        </form>
      ) : (
        <p className="mt-3 border-t border-line-soft pt-3 text-xs text-muted">
          No other active sessions.
        </p>
      )}
    </Card>
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
        <p className="text-sm text-muted">No permissions.</p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-1">
            {permissions.map((permission) => (
              <li
                key={permission}
                className="rounded bg-surface-2 px-2 py-1 font-mono text-[11px] text-fg"
              >
                {permission}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            To change these, someone with the right permission edits your roles from{" "}
            <Link href="/users" className="text-accent-text underline">
              Users
            </Link>
            .
          </p>
        </>
      )}
    </Card>
  );
}
