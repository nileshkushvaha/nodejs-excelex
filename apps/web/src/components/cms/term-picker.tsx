"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { createTerm, searchTerms } from "@/app/(app)/content/terms-actions";
import type { CmsTerm } from "@/lib/api";

/**
 * Categories as a checkbox tree, tags as tokens — the two shapes people
 * already know from every blogging tool, kept because they fit the data:
 * categories are few, nested and chosen from; tags are many, flat and typed.
 *
 * Both can create inline when the person holds `cms.taxonomy.manage`, so a
 * new topic does not mean leaving a half-written post. A created term is
 * appended locally and selected at once; the API's own list is the truth the
 * next time the page loads.
 */
export function CategoryPicker({
  terms: initial,
  selected,
  onChange,
  canCreate,
  disabled,
}: {
  terms: readonly CmsTerm[];
  selected: readonly string[];
  onChange: (ids: string[]) => void;
  canCreate: boolean;
  disabled?: boolean;
}) {
  const [terms, setTerms] = useState<readonly CmsTerm[]>(initial);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  useEffect(() => setTerms(initial), [initial]);

  const tree = useMemo(() => buildTree(terms), [terms]);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((entry) => entry !== id) : [...selected, id]);
  }

  function add() {
    if (!name.trim()) return;
    setError(undefined);
    startTransition(async () => {
      const result = await createTerm({ taxonomy: "CATEGORY", name: name.trim(), parentId: parentId || null });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const created = result.data as CmsTerm;
      setTerms((current) => [...current, created]);
      onChange([...selected, created.id]);
      setName("");
      setParentId("");
      setAdding(false);
    });
  }

  return (
    <div className="space-y-2">
      <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-line-soft bg-surface-2 p-2 text-sm">
        {tree.length === 0 ? <p className="px-1 py-1 text-xs text-faint">No categories yet.</p> : null}
        {tree.map((node) => (
          <TreeRow key={node.term.id} node={node} depth={0} selected={selected} onToggle={toggle} disabled={disabled} />
        ))}
      </div>

      {canCreate && !disabled ? (
        adding ? (
          <div className="space-y-2 rounded-lg border border-line-soft p-2">
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  add();
                }
              }}
              placeholder="New category name"
              className="w-full rounded border border-line-strong bg-surface px-2 py-1 text-xs outline-none focus:border-accent"
            />
            <select
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
              className="w-full rounded border border-line-strong bg-surface px-2 py-1 text-xs outline-none focus:border-accent"
            >
              <option value="">— Parent category —</option>
              {flatten(tree).map(({ term, depth }) => (
                <option key={term.id} value={term.id}>
                  {"— ".repeat(depth)}
                  {term.name}
                </option>
              ))}
            </select>
            {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
            <div className="flex gap-2">
              <button type="button" onClick={add} disabled={pending || !name.trim()} className="btn-primary rounded px-2.5 py-1 text-xs font-medium disabled:opacity-60">
                {pending ? "Adding…" : "Add category"}
              </button>
              <button type="button" onClick={() => setAdding(false)} className="text-xs text-muted hover:text-fg">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="text-xs text-accent-text hover:underline">
            + Add new category
          </button>
        )
      ) : null}
    </div>
  );
}

interface TreeNode {
  term: CmsTerm;
  children: TreeNode[];
}

function buildTree(terms: readonly CmsTerm[]): TreeNode[] {
  const byParent = new Map<string | null, CmsTerm[]>();
  const ids = new Set(terms.map((term) => term.id));
  for (const term of terms) {
    // A parent the list does not contain is treated as none, so an orphan is
    // still shown rather than lost.
    const key = term.parentId && ids.has(term.parentId) ? term.parentId : null;
    const list = byParent.get(key) ?? [];
    list.push(term);
    byParent.set(key, list);
  }
  const build = (parentId: string | null): TreeNode[] =>
    (byParent.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((term) => ({ term, children: build(term.id) }));
  return build(null);
}

function flatten(tree: TreeNode[], depth = 0): Array<{ term: CmsTerm; depth: number }> {
  return tree.flatMap((node) => [{ term: node.term, depth }, ...flatten(node.children, depth + 1)]);
}

function TreeRow({
  node,
  depth,
  selected,
  onToggle,
  disabled,
}: {
  node: TreeNode;
  depth: number;
  selected: readonly string[];
  onToggle: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-surface-3" style={{ paddingLeft: `${depth * 16 + 4}px` }}>
        <input
          type="checkbox"
          checked={selected.includes(node.term.id)}
          onChange={() => onToggle(node.term.id)}
          disabled={disabled}
          className="accent-accent"
        />
        <span className="text-fg">{node.term.name}</span>
        <span className="ml-auto text-[11px] tabular-nums text-faint">{node.term.count}</span>
      </label>
      {node.children.map((child) => (
        <TreeRow key={child.term.id} node={child} depth={depth + 1} selected={selected} onToggle={onToggle} disabled={disabled} />
      ))}
    </>
  );
}

export function TagPicker({
  selected,
  onChange,
  canCreate,
  disabled,
}: {
  selected: readonly Pick<CmsTerm, "id" | "name" | "slug">[];
  onChange: (tags: Pick<CmsTerm, "id" | "name" | "slug">[]) => void;
  canCreate: boolean;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<CmsTerm[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Suggestions arrive from the API a beat after typing stops: a term list
  // can be long, and one request per keystroke is a poor trade for a tag box.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }
    timer.current = setTimeout(() => {
      void searchTerms("TAG", query.trim()).then((rows) => {
        setSuggestions(rows.filter((row) => !selected.some((tag) => tag.id === row.id)));
        setOpen(true);
      });
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, selected]);

  function pick(tag: Pick<CmsTerm, "id" | "name" | "slug">) {
    onChange([...selected, tag]);
    setQuery("");
    setSuggestions([]);
    setOpen(false);
  }

  function create() {
    const name = query.trim();
    if (!name) return;
    const existing = suggestions.find((row) => row.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      pick(existing);
      return;
    }
    if (!canCreate) return;
    setError(undefined);
    startTransition(async () => {
      const result = await createTerm({ taxonomy: "TAG", name });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      pick(result.data as CmsTerm);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {selected.map((tag) => (
          <span key={tag.id} className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 text-xs text-fg ring-1 ring-inset ring-line">
            {tag.name}
            {!disabled ? (
              <button
                type="button"
                aria-label={`Remove ${tag.name}`}
                onClick={() => onChange(selected.filter((entry) => entry.id !== tag.id))}
                className="text-muted hover:text-fg"
              >
                ×
              </button>
            ) : null}
          </span>
        ))}
        {selected.length === 0 ? <span className="text-xs text-faint">No tags.</span> : null}
      </div>

      {!disabled ? (
        <div className="relative">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => suggestions.length && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                create();
              }
            }}
            placeholder={canCreate ? "Type a tag, Enter to add" : "Type to find a tag"}
            className="w-full rounded border border-line-strong bg-surface px-2 py-1 text-xs outline-none focus:border-accent"
          />
          {open && (suggestions.length || (canCreate && query.trim())) ? (
            <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-line bg-surface p-1 text-xs shadow-lg">
              {suggestions.map((row) => (
                <li key={row.id}>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => pick(row)} className="block w-full rounded px-2 py-1 text-left text-fg hover:bg-surface-2">
                    {row.name} <span className="text-faint">({row.count})</span>
                  </button>
                </li>
              ))}
              {canCreate && query.trim() && !suggestions.some((row) => row.name.toLowerCase() === query.trim().toLowerCase()) ? (
                <li>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={create} disabled={pending} className="block w-full rounded px-2 py-1 text-left text-accent-text hover:bg-surface-2">
                    {pending ? "Adding…" : `Create "${query.trim()}"`}
                  </button>
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
