"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { CommandPalette } from "@/components/command-palette";
import { FullscreenToggle, HelpMenu, QuickLinksMenu, TrackingSearch } from "@/components/header-menus";
import { NotificationBell } from "@/components/notification-bell";
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
        <header className="relative flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6">
          <span aria-hidden="true" className="brand-gradient absolute inset-x-0 bottom-0 h-px opacity-60" />
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
            <TrackingSearch />
            <QuickLinksMenu permissions={permissions} />
            <FullscreenToggle />
            <ThemeToggle />
            <HelpMenu permissions={permissions} />
            <NotificationBell />
            <UserMenu user={user} />
          </div>
        </header>

        {/* One content width for every page. Lists and forms previously chose
            their own — four different values between them — so moving from a
            list to its edit form visibly shifted the page under the pointer.
            Setting it here means a new page inherits it rather than guessing. */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
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
    // A failed logout call — the API down, the session already gone — still
    // ends at the sign-in page: the cookie is what the server honours, and if
    // it could not be revoked now the layout's session check will send the
    // person back here the moment the API returns. Swallowing the failure is
    // deliberate; surfacing it would trap them in a shell they want to leave.
    try {
      await fetch("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // Intentionally ignored: see above.
    }
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
        <span className="brand-gradient grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-semibold text-white">
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
          className="absolute right-0 z-50 mt-1 w-56 overflow-hidden card rounded-xl py-1 shadow-lg"
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
