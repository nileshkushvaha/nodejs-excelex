"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/icon";
import { visibleSections, type NavigationSection } from "@/lib/navigation";

interface SidebarProps {
  readonly clientName: string;
  readonly permissions: string[];
}

export function Sidebar({ clientName, permissions }: SidebarProps) {
  const pathname = usePathname();
  const sections: NavigationSection[] = visibleSections(permissions);

  return (
    <nav
      aria-label="Main"
      className="flex h-full w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-900 text-slate-300"
    >
      <div className="flex h-14 items-center gap-2 border-b border-slate-800 px-4">
        <span className="grid h-7 w-7 place-items-center rounded bg-sky-500 text-sm font-bold text-white">
          E
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">ExcelEx</p>
          <p className="truncate text-[11px] text-slate-400">{clientName}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        {sections.map((section) => (
          <div key={section.title} className="mb-4">
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {section.title}
            </p>
            <ul>
              {section.items.map((item) => {
                const active = pathname === item.href;

                if (item.comingSoon) {
                  return (
                    <li key={item.href}>
                      <span
                        className="flex cursor-not-allowed items-center gap-2.5 rounded px-2 py-1.5 text-sm text-slate-600"
                        title="Arrives in a later phase"
                      >
                        <Icon name={item.icon} />
                        <span className="flex-1">{item.label}</span>
                        <span className="rounded bg-slate-800 px-1 text-[9px] uppercase tracking-wide text-slate-500">
                          soon
                        </span>
                      </span>
                    </li>
                  );
                }

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-2.5 rounded px-2 py-1.5 text-sm transition-colors ${
                        active
                          ? "bg-sky-500/15 font-medium text-sky-300"
                          : "hover:bg-slate-800 hover:text-white"
                      }`}
                    >
                      <Icon name={item.icon} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <p className="border-t border-slate-800 px-4 py-3 text-[10px] text-slate-600">
        Phase 1 · foundation
      </p>
    </nav>
  );
}
