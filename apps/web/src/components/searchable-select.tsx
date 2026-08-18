"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/** Shared by the filter bar and the forms, so both look and behave the same. */
export const filterControl =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent-soft";

/**
 * A select you can type into.
 *
 * Native <select> narrows by first letter only, so a thirty-six entry state
 * list means scrolling. This keeps the same shape and keyboard contract —
 * arrows move, Enter picks, Escape closes — and adds matching on any part of
 * the label.
 */
export function SearchableSelect({
  value,
  options,
  allLabel,
  onChange,
}: {
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  allLabel?: string | null;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const everything = useMemo(
    () => (allLabel === null ? options : [{ value: "", label: allLabel ?? "All" }, ...options]),
    [allLabel, options],
  );

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? everything.filter((o) => o.label.toLowerCase().includes(needle)) : everything;
  }, [everything, query]);

  const selected = everything.find((option) => option.value === value);

  // Clicking anywhere else closes it, the way a native select does.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep the highlighted row in view when the arrows walk past the edge.
  useEffect(() => {
    list.current?.children[highlight]?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  function openList() {
    // Open on the current value, so the list starts where the eye expects it.
    setHighlight(Math.max(0, everything.findIndex((option) => option.value === value)));
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setQuery("");
  }

  function choose(option: { value: string }) {
    onChange(option.value);
    close();
  }

  return (
    <div ref={root} className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls="filter-options"
        autoComplete="off"
        value={open ? query : (selected?.label ?? "")}
        placeholder={allLabel ?? "All"}
        onChange={(event) => {
          setQuery(event.target.value);
          setHighlight(0);
          setOpen(true);
        }}
        onFocus={openList}
        // Focus alone is not enough: after picking an option the input keeps
        // focus, so clicking it again would otherwise do nothing.
        onClick={openList}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) return openList();
            const step = event.key === "ArrowDown" ? 1 : -1;
            setHighlight((current) =>
              matches.length === 0 ? 0 : (current + step + matches.length) % matches.length,
            );
          } else if (event.key === "Enter") {
            if (!open) return;
            event.preventDefault();
            const option = matches[highlight];
            if (option) choose(option);
          } else if (event.key === "Escape") {
            close();
          }
        }}
        className={`${filterControl} pr-8`}
      />

      {/* Without the chevron this reads as a text box, and it is sitting next
          to native selects that have one. */}
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        fill="currentColor"
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
      >
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
          clipRule="evenodd"
        />
      </svg>

      {open ? (
        <ul
          ref={list}
          id="filter-options"
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line-strong bg-surface py-1 shadow-lg"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">No match</li>
          ) : (
            matches.map((option, index) => (
              <li
                key={option.value || "__all"}
                role="option"
                aria-selected={option.value === value}
                // pointerdown, not click: the input's blur would otherwise
                // close the list out from under the click.
                onPointerDown={(event) => {
                  event.preventDefault();
                  choose(option);
                }}
                onPointerEnter={() => setHighlight(index)}
                className={`cursor-pointer px-3 py-1.5 text-sm ${
                  index === highlight ? "bg-accent-soft text-accent-text" : "text-fg"
                }`}
              >
                {option.label}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * The same control, in a form.
 *
 * A form posts FormData, which only carries named inputs — so the visible
 * control is the combobox and a hidden input under the same name carries what
 * it chose. Without that the field would look right and submit nothing.
 */
export function SearchableField({
  name,
  options,
  defaultValue = "",
  allLabel,
}: {
  name: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  defaultValue?: string;
  allLabel?: string | null;
}) {
  const [value, setValue] = useState(defaultValue);

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <SearchableSelect value={value} options={options} allLabel={allLabel} onChange={setValue} />
    </>
  );
}
