"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/icon";
import { groupContains, visibleNavigation, type NavigationGroup } from "@/lib/navigation";

interface SidebarProps {
  readonly clientName: string;
  readonly permissions: string[];
  readonly collapsed: boolean;
  readonly mobileOpen: boolean;
  readonly onMobileClose: () => void;
}

export function Sidebar({
  clientName,
  permissions,
  collapsed,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();
  const sections = useMemo(() => visibleNavigation(permissions), [permissions]);

  return (
    <>
      {/* Mobile scrim. The drawer overlays content rather than pushing it. */}
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      ) : null}

      <nav
        aria-label="Main"
        className={`fixed inset-y-0 left-0 z-40 flex h-dvh shrink-0 flex-col border-r border-line bg-surface transition-[width,transform] duration-200 lg:static lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "w-[76px]" : "w-64"}`}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-line px-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-sm font-bold text-white">
            E
          </span>
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-fg">ExcelEx</p>
              <p className="truncate text-[11px] text-muted">{clientName}</p>
            </div>
          ) : null}
        </div>

        {/* overflow-x stays visible so a collapsed group's flyout can escape the
            rail; overflow-y is handled by the inner wrapper for the same reason. */}
        <div className={`flex-1 py-3 ${collapsed ? "overflow-visible" : "overflow-y-auto"} px-3`}>
          {sections.map((section) => (
            <div key={section.title} className="mb-5">
              {collapsed ? (
                <p
                  className="pb-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-faint"
                  aria-hidden="true"
                >
                  ···
                </p>
              ) : (
                <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
                  {section.title}
                </p>
              )}

              <ul className="space-y-0.5">
                {section.groups.map((group) => (
                  <GroupNode
                    key={group.label}
                    group={group}
                    section={section.title}
                    pathname={pathname}
                    collapsed={collapsed}
                    onNavigate={onMobileClose}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>

        {!collapsed ? (
          <p className="border-t border-line px-4 py-3 text-[11px] text-faint">Phase 1 · foundation</p>
        ) : null}
      </nav>
    </>
  );
}

function GroupNode({
  group,
  section,
  pathname,
  collapsed,
  onNavigate,
}: {
  group: NavigationGroup;
  section: string;
  pathname: string;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const containsCurrent = groupContains(group, pathname);
  const [open, setOpen] = useState(containsCurrent);
  const [flyout, setFlyout] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Navigating into a group from elsewhere should reveal where you now are.
  useEffect(() => {
    if (containsCurrent) setOpen(true);
  }, [containsCurrent]);

  useEffect(() => {
    if (!collapsed) setFlyout(false);
  }, [collapsed]);

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  /**
   * The flyout closes on a short delay rather than immediately.
   *
   * There is a diagonal gap between the rail and the panel; without the delay
   * the panel disappears the instant the pointer crosses it, and the items are
   * unreachable by anything but a perfectly horizontal mouse movement.
   */
  function openFlyout() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setFlyout(true);
  }
  function closeFlyoutSoon() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setFlyout(false), 150);
  }

  const rowBase =
    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";
  const activeRow = "bg-accent-soft font-medium text-accent-text";
  const idleRow = "text-muted hover:bg-surface-2 hover:text-fg";

  // ── A leaf: a link with no children ──────────────────────────────────────
  if (!group.children) {
    const active = Boolean(
      group.href && (pathname === group.href || pathname.startsWith(`${group.href}/`)),
    );

    if (group.comingSoon) {
      return (
        <li>
          <span
            className={`${rowBase} cursor-not-allowed text-faint`}
            title={`${group.label} — arrives in a later phase`}
          >
            <Icon name={group.icon} className="h-[18px] w-[18px] shrink-0" />
            {!collapsed ? (
              <>
                <span className="flex-1 truncate">{group.label}</span>
                <SoonBadge />
              </>
            ) : null}
          </span>
        </li>
      );
    }

    return (
      <li>
        <Link
          href={group.href ?? "#"}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          title={collapsed ? group.label : undefined}
          className={`${rowBase} ${active ? activeRow : idleRow} ${collapsed ? "justify-center px-0" : ""}`}
        >
          <Icon name={group.icon} className="h-[18px] w-[18px] shrink-0" />
          {!collapsed ? <span className="truncate">{group.label}</span> : null}
        </Link>
      </li>
    );
  }

  // ── A container ──────────────────────────────────────────────────────────
  return (
    <li
      className="relative"
      onMouseEnter={collapsed ? openFlyout : undefined}
      onMouseLeave={collapsed ? closeFlyoutSoon : undefined}
    >
      <button
        type="button"
        onClick={() => (collapsed ? setFlyout((previous) => !previous) : setOpen((p) => !p))}
        onFocus={collapsed ? openFlyout : undefined}
        aria-expanded={collapsed ? flyout : open}
        title={collapsed ? group.label : undefined}
        className={`${rowBase} ${
          containsCurrent ? activeRow : idleRow
        } ${collapsed ? "justify-center px-0" : ""}`}
      >
        <Icon name={group.icon} className="h-[18px] w-[18px] shrink-0" />
        {!collapsed ? (
          <>
            <span className="flex-1 truncate text-left">{group.label}</span>
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              className={`h-3 w-3 shrink-0 opacity-60 transition-transform ${open ? "rotate-90" : ""}`}
            >
              <path d="M9 6l6 6-6 6z" />
            </svg>
          </>
        ) : null}
      </button>

      {/* Collapsed: the children appear beside the rail on hover or focus, so a
          collapsed sidebar stays navigable rather than becoming a row of
          unlabelled icons whose contents you have to remember. */}
      {collapsed && flyout ? (
        <div
          className="absolute left-full top-0 z-50 pl-2"
          onMouseEnter={openFlyout}
          onMouseLeave={closeFlyoutSoon}
        >
          <div className="min-w-52 overflow-hidden card rounded-xl py-1 shadow-xl">
            <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">
              {section} · {group.label}
            </p>
            <ChildList group={group} pathname={pathname} onNavigate={onNavigate} inFlyout />
          </div>
        </div>
      ) : null}

      {!collapsed && open ? (
        <ul className="ml-[26px] mt-0.5 space-y-0.5 border-l border-line pl-3">
          <ChildList group={group} pathname={pathname} onNavigate={onNavigate} />
        </ul>
      ) : null}
    </li>
  );
}

function ChildList({
  group,
  pathname,
  onNavigate,
  inFlyout,
}: {
  group: NavigationGroup;
  pathname: string;
  onNavigate: () => void;
  inFlyout?: boolean;
}) {
  const items = (group.children ?? []).map((item) => {
    const active = pathname === item.href;

    if (item.comingSoon) {
      return (
        <li key={item.href}>
          <span
            className={`flex cursor-not-allowed items-center gap-2 text-[13px] text-faint ${
              inFlyout ? "px-3 py-1.5" : "rounded px-2 py-1"
            }`}
            title="Arrives in a later phase"
          >
            <span className="flex-1 truncate">{item.label}</span>
            <SoonBadge />
          </span>
        </li>
      );
    }

    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={`block truncate text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
            inFlyout ? "px-3 py-1.5" : "rounded px-2 py-1"
          } ${
            active
              ? "bg-accent-soft font-medium text-accent-text"
              : "text-muted hover:bg-surface-2 hover:text-fg"
          }`}
        >
          {item.label}
        </Link>
      </li>
    );
  });

  return inFlyout ? <ul>{items}</ul> : <>{items}</>;
}

function SoonBadge() {
  return (
    <span className="shrink-0 rounded bg-surface-2 px-1 text-[9px] uppercase tracking-wide text-faint">
      soon
    </span>
  );
}
