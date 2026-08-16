"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    // Same-origin: Next proxies /api to the API, so the host-only session cookie
    // is sent without CORS and without widening its scope.
    await fetch("/api/v1/auth/logout", { method: "POST" });
    // refresh() before push() so the server components re-run and drop the
    // now-revoked session from the rendered output rather than showing it until
    // the next navigation.
    router.refresh();
    router.push("/login");
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="rounded border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
