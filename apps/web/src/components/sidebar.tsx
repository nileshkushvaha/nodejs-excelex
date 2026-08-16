"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/icon";
import {
  groupContains,
  visibleNavigation,
  type NavigationGroup,
} from "@/lib/navigation";

const COLLAPSE_KEY = "excelex.sidebar.collapsed";

interface SidebarProps {
  readonly clientName: string;
  readonly permissions: string[];
  /** Mobile drawer state, owned by the layout so the header can toggle it. */
  readonly mobileOpen: boolean;
  readonly onMobileClose: () => void;
}

export function Sidebar({ clientName, permissions, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const sections = useMemo(() => visibleNavigation(permissions), [permissions]);

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
    <>
      {/* Scrim. Mobile only — the drawer overlays content rather than pushing it. */}
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      ) : null}

      <nav
        aria-label="Main"
        className={`fixed inset-y-0 left-0 z-40 flex h-dvh shrink-0 flex-col border-r border-slate-800 bg-slate-900 text-slate-300 transition-[width,transform] duration-200 lg:static lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "w-16" : "w-60"}`}
      >
        <div className="flex h-14 items-center gap-2 border-b border-slate-800 px-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-sky-500 text-sm font-bold text-white">
            E
          </span>
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">ExcelEx</p>
              <p className="truncate text-[11px] text-slate-400">{clientName}</p>
            </div>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3">
          {sections.map((section) => (
            <div key={section.title} className="mb-4">
              {collapsed ? (
                <div className="mx-2 mb-2 border-t border-slate-800" aria-hidden="true" />
              ) : (
                <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {section.title}
                </p>
              )}

              <ul className="space-y-0.5">
                {section.groups.map((group) => (
                  <GroupNode
                    key={group.label}
                    group={group}
                    pathname={pathname}
                    collapsed={collapsed}
                    onExpandRequest={() => setCollapsed(false)}
                    onNavigate={onMobileClose}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden items-center gap-2 border-t border-slate-800 px-4 py-3 text-[11px] text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300 focus-visible:outline-2 focus-visible:outline-sky-400 lg:flex"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className={`h-3.5 w-3.5 transition-transform ${collapsed ? "rotate-180" : ""}`}>
            <path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4-4.6-4.6z" />
          </svg>
          {!collapsed ? <span>Collapse</span> : null}
        </button>
      </nav>
    </>
  );
}

function GroupNode({
  group,
  pathname,
  collapsed,
  onExpandRequest,
  onNavigate,
}: {
  group: NavigationGroup;
  pathname: string;
  collapsed: boolean;
  onExpandRequest: () => void;
  onNavigate: () => void;
}) {
  const containsCurrent = groupContains(group, pathname);
  const [open, setOpen] = useState(containsCurrent);

  // Navigating into a group from elsewhere should reveal where you now are.
  useEffect(() => {
    if (containsCurrent) setOpen(true);
  }, [containsCurrent]);

  const base =
    "flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-400";

  // A leaf group: a link with no children.
  if (!group.children) {
    if (group.comingSoon) {
      return (
        <li>
          <span
            className={`${base} cursor-not-allowed text-slate-600`}
            title={`${group.label} — arrives in a later phase`}
          >
            <Icon name={group.icon} className="h-4 w-4 shrink-0" />
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

    const active = pathname === group.href || pathname.startsWith(`${group.href}/`);

    return (
      <li>
        <Link
          href={group.href ?? "#"}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          title={collapsed ? group.label : undefined}
          className={`${base} ${
            active ? "bg-sky-500/15 font-medium text-sky-300" : "hover:bg-slate-800 hover:text-white"
          }`}
        >
          <Icon name={group.icon} className="h-4 w-4 shrink-0" />
          {!collapsed ? <span className="truncate">{group.label}</span> : null}
        </Link>
      </li>
    );
  }

  // A container: clicking it in the collapsed rail expands the sidebar first,
  // because opening an accordion nobody can read is not a useful outcome.
  return (
    <li>
      <button
        type="button"
        onClick={() => (collapsed ? onExpandRequest() : setOpen((previous) => !previous))}
        aria-expanded={collapsed ? undefined : open}
        title={collapsed ? group.label : undefined}
        className={`${base} ${
          containsCurrent && !open ? "text-sky-300" : "hover:bg-slate-800 hover:text-white"
        }`}
      >
        <Icon name={group.icon} className="h-4 w-4 shrink-0" />
        {!collapsed ? (
          <>
            <span className="flex-1 truncate text-left">{group.label}</span>
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              className={`h-3 w-3 shrink-0 text-slate-500 transition-transform ${open ? "rotate-90" : ""}`}
            >
              <path d="M9 6l6 6-6 6z" />
            </svg>
          </>
        ) : null}
      </button>

      {open && !collapsed ? (
        <ul className="mt-0.5 space-y-0.5 border-l border-slate-800 pl-3 ml-4">
          {group.children.map((item) => {
            const active = pathname === item.href;

            if (item.comingSoon) {
              return (
                <li key={item.href}>
                  <span
                    className="flex cursor-not-allowed items-center gap-2 rounded px-2 py-1 text-[13px] text-slate-600"
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
                  className={`block truncate rounded px-2 py-1 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-400 ${
                    active
                      ? "bg-sky-500/15 font-medium text-sky-300"
                      : "text-slate-400 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

function SoonBadge() {
  return (
    <span className="shrink-0 rounded bg-slate-800 px-1 text-[9px] uppercase tracking-wide text-slate-500">
      soon
    </span>
  );
}
