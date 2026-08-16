"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { CommandPalette } from "@/components/command-palette";
import { Sidebar } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme";

const COLLAPSE_KEY = "excelex.sidebar.collapsed";

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
 * A client component because the sidebar, palette and menus are stateful, but it
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

  // Read on mount rather than during render: localStorage does not exist on the
  // server, and reading it in the initial state would make the first client
  // render disagree with the server's HTML.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "true");
  }, []);

  function toggleCollapsed() {
    setCollapsed((previous) => {
      window.localStorage.setItem(COLLAPSE_KEY, String(!previous));
      return !previous;
    });
  }

  return (
    <div className="flex h-dvh bg-canvas">
      <Sidebar
        clientName={clientHost}
        permissions={permissions}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6">
          {/* The collapse control lives beside the content it resizes, not at the
              bottom of the panel it hides — where, once collapsed, it is the one
              thing a user has to hunt for. */}
          <button
            type="button"
            onClick={() => (window.innerWidth < 1024 ? setMobileOpen(true) : toggleCollapsed())}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-5 w-5">
              <path d="M3 6h18v2H3V6zm0 5h12v2H3v-2zm0 5h18v2H3v-2z" />
            </svg>
          </button>

          <div className="min-w-0 flex-1">
            <CommandPalette permissions={permissions} />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <StatusPill status={clientStatus} host={clientHost} />
            <ThemeToggle />
            <Notifications />
            <UserMenu user={user} />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

function StatusPill({ status, host }: { status: string; host: string }) {
  const tone =
    status === "ACTIVE"
      ? "text-emerald-700 dark:text-emerald-400"
      : status === "TRIAL"
        ? "text-accent-text"
        : "text-amber-700 dark:text-amber-400";

  const dot =
    status === "ACTIVE" ? "bg-emerald-500" : status === "TRIAL" ? "bg-sky-500" : "bg-amber-500";

  return (
    <span
      title={`${host} — ${status}`}
      className={`mr-1 hidden items-center gap-1.5 text-xs font-medium md:inline-flex ${tone}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  );
}

/**
 * Present because the header would look wrong without it, and honest about
 * having nothing to show. There is no notification system yet — a badge with a
 * number on it would be the first thing a user learns not to trust.
 */
function Notifications() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-label="Notifications"
        aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded-full border border-line text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4">
          <path d="M12 2a6 6 0 00-6 6v3.6l-1.7 3.1A1 1 0 005.2 16h13.6a1 1 0 00.9-1.3L18 11.6V8a6 6 0 00-6-6zm0 20a3 3 0 002.8-2H9.2a3 3 0 002.8 2z" />
        </svg>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-1 w-72 rounded-lg border border-line bg-surface p-4 shadow-lg"
        >
          <p className="text-sm font-medium text-fg">No notifications</p>
          <p className="mt-1 text-xs text-muted">
            Alerts for quota warnings, failed jobs and locked accounts arrive with the modules that
            raise them. Everything that happens is already recorded in the audit trail.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function UserMenu({ user }: { user: { fullName: string; email: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Dismiss on outside click and on Escape. A menu that can only be closed by
  // choosing something from it is a trap, especially for keyboard users.
  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
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
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full p-0.5 pr-2 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-[12px] font-semibold text-white">
          {initials || "?"}
        </span>
        <span className="hidden text-sm font-medium text-fg sm:block">
          {user.fullName.split(" ")[0]}
        </span>
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-3 w-3 text-faint">
          <path d="M12 15L6 9h12z" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg"
        >
          <div className="border-b border-line-soft px-3 py-2">
            <p className="truncate text-sm font-medium text-fg">{user.fullName}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>

          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-fg hover:bg-surface-2"
          >
            My profile
          </Link>
          <Link
            href="/profile/password"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-fg hover:bg-surface-2"
          >
            Change password
          </Link>

          <div className="my-1 border-t border-line-soft" />

          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            disabled={busy}
            className="block w-full px-3 py-2 text-left text-sm text-fg hover:bg-surface-2 disabled:opacity-50"
          >
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
