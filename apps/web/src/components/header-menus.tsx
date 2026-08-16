"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { HELP_LINKS, QUICK_LINKS, type NavigationItem } from "@/lib/navigation";

/**
 * A header dropdown. Dismisses on outside click and on Escape, because a menu
 * that can only be closed by choosing from it is a trap — particularly for
 * keyboard users, who cannot click elsewhere to escape it.
 */
function Dropdown({
  label,
  icon,
  children,
  align = "right",
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
}) {
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
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded-full border border-line text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
      >
        {icon}
      </button>

      {open ? (
        <div
          role="menu"
          className={`absolute ${align === "right" ? "right-0" : "left-0"} z-50 mt-1 w-60 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg`}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function MenuLinks({ items, permissions }: { items: readonly NavigationItem[]; permissions: string[] }) {
  const held = new Set(permissions);
  const visible = items.filter((item) => !item.permission || held.has(item.permission));

  if (visible.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted">Nothing available to you yet.</p>;
  }

  return (
    <>
      {visible.map((item) =>
        item.comingSoon ? (
          <span
            key={item.href}
            className="flex cursor-not-allowed items-center justify-between gap-2 px-3 py-2 text-sm text-faint"
            title="Arrives in a later phase"
          >
            {item.label}
            <span className="rounded bg-surface-2 px-1 text-[9px] uppercase tracking-wide">soon</span>
          </span>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            role="menuitem"
            className="block px-3 py-2 text-sm text-fg hover:bg-surface-2"
          >
            {item.label}
          </Link>
        ),
      )}
    </>
  );
}

export function QuickLinksMenu({ permissions }: { permissions: string[] }) {
  return (
    <Dropdown
      label="Quick links"
      icon={
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4">
          <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />
        </svg>
      }
    >
      <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">
        Quick links
      </p>
      <MenuLinks items={QUICK_LINKS} permissions={permissions} />
    </Dropdown>
  );
}

export function HelpMenu({ permissions }: { permissions: string[] }) {
  return (
    <Dropdown
      label="Help"
      icon={
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4">
          <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm.1 15.5a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4zM12 5.6c2.2 0 3.9 1.4 3.9 3.4 0 1.3-.7 2.1-1.8 2.9-.9.6-1.2 1-1.2 1.8v.4h-1.9v-.6c0-1.4.6-2.2 1.7-2.9.9-.6 1.2-1 1.2-1.6 0-.8-.7-1.4-1.8-1.4s-1.9.7-2 1.8H8.2c.1-2.2 1.7-3.8 3.8-3.8z" />
        </svg>
      }
    >
      <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">
        Help
      </p>
      <MenuLinks items={HELP_LINKS} permissions={permissions} />
    </Dropdown>
  );
}

/**
 * Fullscreen toggle, carried over from the legacy header.
 *
 * It earns its place for a reason specific to this product: hub and counter
 * staff work on fixed terminals all shift, and the browser chrome is wasted
 * vertical space on a scanning screen. The Fullscreen API needs a user gesture,
 * which a click already is.
 */
export function FullscreenToggle() {
  const [isFull, setIsFull] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function toggle() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // Refused by the browser or blocked by policy. Nothing useful to say —
      // the button simply does not take effect, which is visible immediately.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isFull ? "Exit fullscreen" : "Enter fullscreen"}
      title={isFull ? "Exit fullscreen" : "Fullscreen"}
      aria-pressed={isFull}
      className="hidden h-9 w-9 place-items-center rounded-full border border-line text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent md:grid"
    >
      {isFull ? (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4">
          <path d="M9 3H7v4H3v2h6V3zm6 0h2v4h4v2h-6V3zM3 15h6v6H7v-4H3v-2zm12 0h6v2h-4v4h-2v-6z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4">
          <path d="M3 3h6v2H5v4H3V3zm12 0h6v6h-2V5h-4V3zM3 15h2v4h4v2H3v-6zm16 0h2v6h-6v-2h4v-4z" />
        </svg>
      )}
    </button>
  );
}

/**
 * Public tracking, reachable from inside the app.
 *
 * Counter staff are asked "where is my parcel" constantly, and the answer lives
 * on the public tracking page — the same one the customer sees, which is what
 * makes it a useful thing to read aloud from.
 */
export function TrackingSearch() {
  return (
    <Link
      href="/track"
      title="Track a shipment"
      className="hidden h-9 items-center gap-2 rounded-full border border-line px-3 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg lg:inline-flex"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4">
        <path d="M12 2a7 7 0 017 7c0 5-7 13-7 13S5 14 5 9a7 7 0 017-7zm0 4.4A2.6 2.6 0 1012 11.6 2.6 2.6 0 0012 6.4z" />
      </svg>
      Track
    </Link>
  );
}
