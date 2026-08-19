"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { ThemeToggle } from "@/components/theme";
import { NAV, type NavItem } from "@/content/site";

/**
 * The public header.
 *
 * Sticky, and it changes at the top of the page rather than everywhere: over
 * the hero it is transparent so the banner reads as full-bleed, and once you
 * scroll it takes a background and a border so text never lands on text. The
 * scroll progress line along the bottom edge is the only always-on motion —
 * it answers "how much is left" without occupying any layout.
 *
 * The menu comes in as a prop: the layout resolves it on the server — the CMS
 * header menu when one is published, the static NAV otherwise — so this
 * component never knows or cares where the links came from.
 */
export function SiteHeader({ nav = NAV }: { nav?: readonly NavItem[] }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    function onScroll() {
      const top = window.scrollY;
      const height = document.documentElement.scrollHeight - window.innerHeight;
      setScrolled(top > 8);
      setProgress(height > 0 ? Math.min(1, top / height) : 0);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // A navigation is a new page; anything the header had open belongs to the old
  // one. Also stops the mobile drawer from covering the page you just chose.
  useEffect(() => {
    setDrawer(false);
    setOpenMenu(null);
  }, [pathname]);

  // The drawer is full-screen, so the page behind it must not scroll under it.
  useEffect(() => {
    if (!drawer) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawer]);

  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled
          ? "border-b border-line/70 bg-surface/70 backdrop-blur-xl backdrop-saturate-150"
          : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold text-fg">
          <span className="brand-gradient grid h-8 w-8 place-items-center rounded-lg text-sm font-bold text-white">
            E
          </span>
          <span className="text-lg tracking-tight">ExcelEx</span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 lg:flex">
          {nav.map((item) =>
            item.children?.length ? (
              <div
                key={item.href}
                className="relative"
                onMouseEnter={() => setOpenMenu(item.href)}
                onMouseLeave={() => setOpenMenu(null)}
              >
                <Link
                  href={item.href}
                  // Hover opens it for a pointer; this keeps it reachable from
                  // the keyboard, where there is no hover to have.
                  onFocus={() => setOpenMenu(item.href)}
                  aria-expanded={openMenu === item.href}
                  className={`flex items-center gap-1 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active(item.href) ? "text-fg" : "text-muted hover:text-fg"
                  }`}
                >
                  {item.label}
                  <Chevron open={openMenu === item.href} />
                </Link>

                <div
                  className={`absolute left-0 top-full w-80 pt-2 transition-[opacity,transform] duration-200 ${
                    openMenu === item.href
                      ? "pointer-events-auto translate-y-0 opacity-100"
                      : "pointer-events-none -translate-y-1 opacity-0"
                  }`}
                >
                  <div className="glass-solid overflow-hidden rounded-2xl p-2 shadow-xl">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className="block rounded-lg px-3 py-2 transition-colors hover:bg-surface-2"
                      >
                        <span className="block text-sm font-medium text-fg">{child.label}</span>
                        {child.description ? (
                          <span className="block text-xs text-muted">{child.description}</span>
                        ) : null}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                  active(item.href) ? "text-fg" : "text-muted hover:text-fg"
                }`}
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <ThemeToggle />
          <Link
            href="/login"
            className="btn-primary hidden rounded-xl px-5 py-2.5 text-sm font-medium sm:inline-block"
          >
            Sign in
          </Link>
          <button
            type="button"
            onClick={() => setDrawer((open) => !open)}
            aria-label={drawer ? "Close menu" : "Open menu"}
            aria-expanded={drawer}
            className="btn-glass grid h-10 w-10 place-items-center rounded-xl lg:hidden"
          >
            <Burger open={drawer} />
          </button>
        </div>
      </div>

      {/* Reading progress. scaleX rather than width: it is composited, so it
          does not lay the page out again on every scroll event. */}
      <div
        aria-hidden
        style={{ transform: `scaleX(${progress})` }}
        className="brand-gradient h-0.5 origin-left"
      />

      {/* Mobile drawer. Rendered always and translated out of the way, so it
          animates in both directions rather than only on open. */}
      <div
        className={`fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto border-t border-line bg-canvas/95 backdrop-blur-xl transition-transform duration-300 lg:hidden ${
          drawer ? "translate-x-0" : "pointer-events-none translate-x-full"
        }`}
      >
        <nav className="px-5 py-4">
          {nav.map((item) => (
            <div key={item.href} className="border-b border-line-soft py-1">
              <Link
                href={item.href}
                className={`block px-1 py-3 text-base font-medium ${
                  active(item.href) ? "text-accent-text" : "text-fg"
                }`}
              >
                {item.label}
              </Link>
              {item.children?.length ? (
                <div className="pb-2 pl-3">
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className="block py-1.5 text-sm text-muted"
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ))}

          <Link
            href="/login"
            className="btn-primary mt-6 block rounded-xl px-4 py-3.5 text-center text-sm font-medium"
          >
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** Three lines that become a cross, so the button says what it will do. */
function Burger({ open }: { open: boolean }) {
  const bar = "absolute left-1/2 h-0.5 w-5 -translate-x-1/2 bg-current transition-all duration-300";
  return (
    <span aria-hidden className="relative block h-4 w-5 text-fg">
      <span className={`${bar} ${open ? "top-1/2 rotate-45" : "top-0.5"}`} />
      <span className={`${bar} top-1/2 -translate-y-1/2 ${open ? "opacity-0" : "opacity-100"}`} />
      <span className={`${bar} ${open ? "top-1/2 -rotate-45" : "bottom-0.5 top-auto"}`} />
    </span>
  );
}
