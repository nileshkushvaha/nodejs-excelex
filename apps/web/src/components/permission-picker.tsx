"use client";

import { useMemo, useState } from "react";

import type { PermissionCatalogueEntry } from "@/lib/api";

/**
 * Grouped permission checkboxes.
 *
 * The catalogue's descriptions are shown inline rather than behind a tooltip:
 * the person choosing what a role may do is usually not the person who named
 * the permission, and "operations.manifest.reopen" does not tell them that
 * reopening a closed manifest is deliberately separate from closing it.
 */
export function PermissionPicker({
  permissions,
  selected,
  disabled,
}: {
  permissions: PermissionCatalogueEntry[];
  selected: string[];
  disabled?: boolean;
}) {
  const [chosen, setChosen] = useState<Set<string>>(new Set(selected));

  // `*` is deliberately not one checkbox among thirty-eight. Buried in the
  // Settings group it is the least visible control on the page, and it is the
  // one with the largest consequence.
  const superEntry = permissions.find((permission) => permission.key === "*");

  const groups = useMemo(() => {
    const map = new Map<string, PermissionCatalogueEntry[]>();
    for (const permission of permissions) {
      if (permission.key === "*") continue;
      const list = map.get(permission.group) ?? [];
      list.push(permission);
      map.set(permission.group, list);
    }
    return [...map.entries()];
  }, [permissions]);

  const holdsAll = chosen.has("*");

  function toggle(key: string, on: boolean) {
    setChosen((previous) => {
      const next = new Set(previous);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {superEntry ? (
        <label
          className={`flex cursor-pointer items-start gap-2.5 rounded border p-3 ${
            holdsAll ? "border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/50" : "border-line bg-surface-2"
          }`}
        >
          <input
            type="checkbox"
            name="permissions"
            value="*"
            disabled={disabled}
            checked={holdsAll}
            onChange={(event) => toggle("*", event.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-amber-600"
          />
          <span>
            <span className="block text-sm font-medium text-fg">
              Full access — every permission
            </span>
            <span className="block text-xs text-muted">
              Includes permissions added in future releases. The individual selections below have no
              additional effect while this is on.
            </span>
          </span>
        </label>
      ) : null}

      <div className={holdsAll ? "opacity-50" : undefined}>
      <div className="space-y-4">

      {groups.map(([group, entries]) => {
        const groupKeys = entries.map((entry) => entry.key);
        const allOn = groupKeys.every((key) => chosen.has(key));

        return (
          <fieldset key={group} className="rounded border border-line">
            <legend className="ml-3 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
              {group}
              <button
                type="button"
                disabled={disabled}
                onClick={() => groupKeys.forEach((key) => toggle(key, !allOn))}
                className="rounded border border-line px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-muted hover:bg-surface-2 disabled:opacity-50"
              >
                {allOn ? "none" : "all"}
              </button>
            </legend>

            <div className="divide-y divide-line-soft">
              {entries.map((entry) => (
                <label
                  key={entry.key}
                  className="flex cursor-pointer items-start gap-2.5 px-3 py-2 hover:bg-surface-2"
                >
                  <input
                    type="checkbox"
                    name="permissions"
                    value={entry.key}
                    disabled={disabled}
                    checked={chosen.has(entry.key)}
                    onChange={(event) => toggle(entry.key, event.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm text-fg">{entry.label}</span>
                    <span className="block text-xs text-muted">{entry.description}</span>
                    <code className="mt-0.5 block font-mono text-[10px] text-faint">
                      {entry.key}
                    </code>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
      </div>
      </div>
    </div>
  );
}
