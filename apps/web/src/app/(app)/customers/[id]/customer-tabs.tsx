"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { slug: "", label: "Customer" },
  { slug: "fuel-surcharges", label: "Fuel surcharges" },
  { slug: "charges", label: "Other charges" },
  { slug: "volumetrics", label: "Volumetric" },
  { slug: "contacts", label: "Contacts" },
] as const;

export function CustomerTabs({ id }: { id: string }) {
  const pathname = usePathname();
  const base = `/customers/${id}`;

  return (
    <nav className="card mb-5 flex flex-wrap gap-1 rounded-xl p-1.5" aria-label="Customer sections">
      {TABS.map((tab) => {
        const href = tab.slug ? `${base}/${tab.slug}` : base;
        const active = pathname === href;

        return (
          <Link
            key={tab.slug}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              active ? "brand-gradient text-white" : "text-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
