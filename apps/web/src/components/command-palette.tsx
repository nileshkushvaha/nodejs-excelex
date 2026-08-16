"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { visibleNavigation } from "@/lib/navigation";

interface Destination {
  label: string;
  href: string;
  group: string;
}

/**
 * Search over the navigation, opened with ⌘K or by clicking the field.
 *
 * It searches destinations, not records. A search box that looks like it covers
 * shipments and customers while only matching menu labels would be a promise the
 * product cannot keep yet; the placeholder says "Jump to a page" for that
 * reason. It becomes record search when there are records.
 *
 * The list comes from the same permission-filtered navigation the sidebar uses,
 * so it cannot offer a page the actor may not open.
 */
export function CommandPalette({ permissions }: { permissions: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const destinations = useMemo<Destination[]>(() => {
    const out: Destination[] = [];
    for (const section of visibleNavigation(permissions)) {
      for (const group of section.groups) {
        if (group.href && !group.comingSoon) {
          out.push({ label: group.label, href: group.href, group: section.title });
        }
        for (const item of group.children ?? []) {
          if (!item.comingSoon) {
            out.push({ label: item.label, href: item.href, group: `${section.title} · ${group.label}` });
          }
        }
      }
    }
    return out;
  }, [permissions]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return destinations.slice(0, 8);
    return destinations
      .filter((d) => `${d.group} ${d.label}`.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [destinations, query]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else {
      setQuery("");
      setHighlighted(0);
    }
  }, [open]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-full max-w-lg items-center gap-2.5 rounded-lg border border-line bg-surface px-3 text-left text-sm text-faint transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-accent"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4 shrink-0">
          <path d="M10 2a8 8 0 105.3 14l4.4 4.3 1.4-1.4-4.3-4.3A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z" />
        </svg>
        <span className="flex-1 truncate">Jump to a page…</span>
        <kbd className="hidden shrink-0 rounded border border-line px-1.5 py-0.5 font-sans text-[11px] text-muted sm:block">
          ⌘ K
        </kbd>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/40 p-4 pt-[12vh]"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Jump to a page"
          >
            <div className="flex items-center gap-2.5 border-b border-line px-4">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-4 w-4 shrink-0 text-faint">
                <path d="M10 2a8 8 0 105.3 14l4.4 4.3 1.4-1.4-4.3-4.3A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setHighlighted(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setHighlighted((index) => Math.min(index + 1, matches.length - 1));
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setHighlighted((index) => Math.max(index - 1, 0));
                  }
                  if (event.key === "Enter") {
                    const target = matches[highlighted];
                    if (target) go(target.href);
                  }
                }}
                placeholder="Jump to a page…"
                aria-label="Search pages"
                className="h-12 flex-1 bg-transparent text-sm outline-none"
              />
              <kbd className="shrink-0 rounded border border-line px-1.5 py-0.5 font-sans text-[11px] text-muted">
                esc
              </kbd>
            </div>

            {matches.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">
                Nothing matches “{query}”. This searches pages, not records — record search arrives
                with the modules that hold them.
              </p>
            ) : (
              <ul className="max-h-80 overflow-y-auto py-1">
                {matches.map((match, index) => (
                  <li key={match.href}>
                    <button
                      type="button"
                      onMouseEnter={() => setHighlighted(index)}
                      onClick={() => go(match.href)}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm ${
                        index === highlighted ? "bg-accent-soft text-accent-text" : "text-fg"
                      }`}
                    >
                      <span className="truncate">{match.label}</span>
                      <span className="shrink-0 text-xs text-faint">{match.group}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
