"use client";

import { useState } from "react";

/**
 * The permalink line under the title.
 *
 * Shows the whole path — parent segments or the blog prefix, then the slug —
 * with only the slug editable, because the rest is decided elsewhere (the
 * parent select, site settings). Slugifying happens as you type so what is
 * shown is what will be saved; the API slugifies again and makes it unique,
 * so this is a preview rather than the rule.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function SlugField({
  prefix,
  slug,
  onChange,
  disabled,
  href,
}: {
  /** Everything before the slug, with leading and trailing slashes: "/", "/blog/", "/services/". */
  prefix: string;
  slug: string;
  onChange: (slug: string) => void;
  disabled?: boolean;
  /** When set, the path is a link (the item is published). */
  href?: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const full = `${prefix}${slug || "…"}`;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className="text-muted">Permalink:</span>
      {editing ? (
        <span className="inline-flex items-center gap-1 font-mono">
          <span className="text-faint">{prefix}</span>
          <input
            autoFocus
            value={slug}
            onChange={(event) => onChange(slugify(event.target.value))}
            onBlur={() => setEditing(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "Escape") setEditing(false);
            }}
            aria-label="Slug"
            className="w-64 rounded border border-line-strong bg-surface px-1.5 py-0.5 font-mono text-xs outline-none focus:border-accent"
          />
        </span>
      ) : (
        <>
          {href ? (
            <a href={href} target="_blank" rel="noopener" className="font-mono text-accent-text hover:underline">
              {full}
            </a>
          ) : (
            <span className="font-mono text-fg">{full}</span>
          )}
          {!disabled ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded border border-line-strong px-1.5 py-0.5 text-[11px] text-muted hover:border-accent hover:text-fg"
            >
              Edit
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
