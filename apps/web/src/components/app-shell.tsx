"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Sidebar } from "@/components/sidebar";

interface AppShellProps {
  readonly clientHost: string;
  readonly clientStatus: string;
  readonly user: { fullName: string; email: string };
  readonly permissions: string[];
  readonly children: ReactNode;
}

/**
 * The authenticated chrome: sidebar, header, and the region pages render into.
 *
 * A client component because the sidebar and user menu are stateful, but it
 * receives the session as props from the server layout — the session is resolved
 * server-side and never fetched here, so nothing about who you are depends on
 * code the browser could be persuaded to skip.
 */
export function AppShell({
  clientHost,
  clientStatus,
  user,
  permissions,
  children,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-dvh bg-slate-50">
      <Sidebar
        clientName={clientHost}
        permissions={permissions}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              className="-ml-1 rounded p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" />
              </svg>
            </button>

            <div className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
              <StatusPill status={clientStatus} />
              <span className="hidden truncate font-mono sm:inline">{clientHost}</span>
            </div>
          </div>

          <UserMenu user={user} />
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "ACTIVE"
      ? "bg-emerald-50 text-emerald-700"
      : status === "TRIAL"
        ? "bg-sky-50 text-sky-700"
        : "bg-amber-50 text-amber-700";

  const dot =
    status === "ACTIVE" ? "bg-emerald-500" : status === "TRIAL" ? "bg-sky-500" : "bg-amber-500";

  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 font-medium ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  );
}

function UserMenu({ user }: { user: { fullName: string; email: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Dismiss on outside click and on Escape. A menu that can only be closed by
  // choosing something from it is a trap, especially for keyboard users.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function signOut() {
    setBusy(true);
    await fetch("/api/v1/auth/logout", { method: "POST" });
    // refresh() before push() so the server components re-run and drop the
    // revoked session from the rendered output.
    router.refresh();
    router.push("/login");
  }

  const initials = user.fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded p-1 pr-2 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-sky-500"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-800 text-[11px] font-semibold text-white">
          {initials || "?"}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-medium leading-tight text-slate-800">
            {user.fullName}
          </span>
          <span className="block text-[11px] leading-tight text-slate-500">{user.email}</span>
        </span>
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-3 w-3 text-slate-400">
          <path d="M12 15L6 9h12z" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          <div className="border-b border-slate-100 px-3 py-2 sm:hidden">
            <p className="truncate text-sm font-medium text-slate-800">{user.fullName}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>

          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            My profile
          </Link>
          <Link
            href="/profile#password"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Change password
          </Link>

          <div className="my-1 border-t border-slate-100" />

          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            disabled={busy}
            className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
