"use client";

import { useActionState } from "react";

import { unlockUser } from "./actions";

/**
 * Present because a lockout duration of 0 means "until an administrator unlocks
 * it" — without this, that setting is a way for a client to lock itself out of
 * its own account permanently.
 */
export function UnlockButton({ userId, lockedUntil }: { userId: string; lockedUntil: string }) {
  const [state, action, pending] = useActionState(unlockUser, null);

  const until = new Date(lockedUntil);
  // A far-future timestamp is how "until an administrator unlocks it" is stored.
  const indefinite = until.getUTCFullYear() > 9000;

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <span
        className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-red-700"
        title={indefinite ? "Locked until an administrator unlocks it" : `Locked until ${until.toLocaleString("en-IN")}`}
      >
        locked
      </span>
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "Unlocking…" : "Unlock"}
      </button>
      {state && !state.ok ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}
