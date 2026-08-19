"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { deleteMenu, saveMenu } from "@/app/(app)/content/menus/actions";
import { Field, FormError, formField } from "@/components/form-field";
import { Toggle } from "@/components/toggle";
import type { ActionResult, CmsMenu, CmsMenuItem, CmsMenuItemInput } from "@/lib/api";

/**
 * A menu editor with buttons instead of drag handles.
 *
 * Up / down / indent / outdent do everything drag-and-drop does on a tree
 * this size — a site menu has a dozen entries, not a thousand — and they
 * work with a keyboard, announce themselves, and never drop an item in the
 * wrong place because the pointer wandered. The whole tree is held locally
 * and saved in one PUT; nothing is written until Save, so an experiment can
 * be abandoned by leaving the page.
 */
interface Choice {
  id: string;
  label: string;
  path: string;
}

type Target =
  | { kind: "page"; id: string; path: string }
  | { kind: "post"; id: string; path: string }
  | { kind: "category"; id: string; path: string }
  | { kind: "url"; url: string };

interface Item {
  key: string;
  label: string;
  description: string;
  target: Target;
  openInNewTab: boolean;
  children: Item[];
}

const LOCATIONS = [
  { key: "header", label: "Header", name: "Main menu" },
  { key: "footer", label: "Footer", name: "Footer menu" },
];

let counter = 0;
const nextKey = () => `k${++counter}`;

function fromApi(items: CmsMenuItem[], pages: Choice[], posts: Choice[], categories: Choice[]): Item[] {
  return items.map((item) => {
    let target: Target;
    if (item.target.contentId) {
      const page = pages.find((choice) => choice.id === item.target.contentId);
      const post = posts.find((choice) => choice.id === item.target.contentId);
      target = post
        ? { kind: "post", id: post.id, path: post.path }
        : { kind: "page", id: item.target.contentId, path: page?.path ?? item.url ?? "" };
    } else if (item.target.termId) {
      const category = categories.find((choice) => choice.id === item.target.termId);
      target = { kind: "category", id: item.target.termId, path: category?.path ?? item.url ?? "" };
    } else {
      target = { kind: "url", url: item.target.url ?? item.url ?? "" };
    }
    return {
      key: nextKey(),
      label: item.label,
      description: item.description ?? "",
      target,
      openInNewTab: item.openInNewTab,
      children: fromApi(item.children ?? [], pages, posts, categories),
    };
  });
}

function toApi(items: Item[]): CmsMenuItemInput[] {
  return items.map((item) => ({
    label: item.label,
    description: item.description || null,
    contentId: item.target.kind === "page" || item.target.kind === "post" ? item.target.id : null,
    termId: item.target.kind === "category" ? item.target.id : null,
    url: item.target.kind === "url" ? item.target.url : null,
    openInNewTab: item.openInNewTab,
    children: toApi(item.children),
  }));
}

/** The array that holds `key`, and the index within it. */
function locate(items: Item[], key: string): { list: Item[]; index: number; parent: Item | null } | null {
  const index = items.findIndex((item) => item.key === key);
  if (index >= 0) return { list: items, index, parent: null };
  for (const item of items) {
    const found = locate(item.children, key);
    if (found) return found.parent ? found : { ...found, parent: item };
  }
  return null;
}

/** Deep copy, so a mutation on the copy is a new value for React. */
const clone = (items: Item[]): Item[] => items.map((item) => ({ ...item, children: clone(item.children) }));

function urlOf(target: Target): string {
  return target.kind === "url" ? target.url : target.path;
}

export function MenuTreeEditor({
  menus,
  pages,
  posts,
  categories,
  canManage,
}: {
  menus: CmsMenu[];
  pages: Choice[];
  posts: Choice[];
  categories: Choice[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [location, setLocation] = useState(LOCATIONS[0].key);
  const [trees, setTrees] = useState<Record<string, { name: string; items: Item[] }>>(() => build(menus));
  const [saved, setSaved] = useState<Record<string, string>>(() => snapshot(build(menus)));
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function build(list: CmsMenu[]) {
    const next: Record<string, { name: string; items: Item[] }> = {};
    for (const loc of LOCATIONS) {
      const menu = list.find((entry) => entry.location === loc.key);
      next[loc.key] = { name: menu?.name ?? loc.name, items: menu ? fromApi(menu.items, pages, posts, categories) : [] };
    }
    for (const menu of list) {
      if (!next[menu.location]) next[menu.location] = { name: menu.name, items: fromApi(menu.items, pages, posts, categories) };
    }
    return next;
  }
  function snapshot(record: Record<string, { name: string; items: Item[] }>) {
    return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, JSON.stringify({ name: value.name, items: toApi(value.items) })]));
  }

  // The server's copy after a save is the truth again.
  useEffect(() => {
    const next = build(menus);
    setTrees(next);
    setSaved(snapshot(next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menus]);

  const current = trees[location] ?? { name: location, items: [] };
  const dirty = JSON.stringify({ name: current.name, items: toApi(current.items) }) !== saved[location];
  const locations = useMemo(
    () => [...LOCATIONS, ...Object.keys(trees).filter((key) => !LOCATIONS.some((loc) => loc.key === key)).map((key) => ({ key, label: key, name: key }))],
    [trees],
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function mutate(work: (items: Item[]) => void) {
    setTrees((all) => {
      const items = clone(all[location]?.items ?? []);
      work(items);
      return { ...all, [location]: { name: all[location]?.name ?? location, items } };
    });
  }

  const move = (key: string, delta: -1 | 1) =>
    mutate((items) => {
      const found = locate(items, key);
      if (!found) return;
      const to = found.index + delta;
      if (to < 0 || to >= found.list.length) return;
      const [item] = found.list.splice(found.index, 1);
      found.list.splice(to, 0, item);
    });

  const indent = (key: string) =>
    mutate((items) => {
      const found = locate(items, key);
      if (!found || found.index === 0) return;
      const [item] = found.list.splice(found.index, 1);
      found.list[found.index - 1].children.push(item);
    });

  const outdent = (key: string) =>
    mutate((items) => {
      const found = locate(items, key);
      if (!found || !found.parent) return;
      const parentPlace = locate(items, found.parent.key);
      if (!parentPlace) return;
      const [item] = found.list.splice(found.index, 1);
      parentPlace.list.splice(parentPlace.index + 1, 0, item);
    });

  const remove = (key: string) =>
    mutate((items) => {
      const found = locate(items, key);
      if (!found) return;
      // Children move up a level rather than vanishing with their parent.
      const [item] = found.list.splice(found.index, 1);
      found.list.splice(found.index, 0, ...item.children);
    });

  const patch = (key: string, changes: Partial<Omit<Item, "key" | "children">>) =>
    mutate((items) => {
      const found = locate(items, key);
      if (found) Object.assign(found.list[found.index], changes);
    });

  function save() {
    setResult(null);
    startTransition(async () => {
      const response = await saveMenu(location, current.name, toApi(current.items));
      setResult(response);
      if (response.ok) router.refresh();
    });
  }

  function destroy() {
    if (!window.confirm(`Empty the ${location} menu? The public site falls back to its default navigation.`)) return;
    startTransition(async () => {
      const response = await deleteMenu(location);
      setResult(response);
      if (response.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <FormError result={result} />

      <nav aria-label="Menu location" className="flex flex-wrap gap-1 text-sm">
        {locations.map((loc) => (
          <button
            key={loc.key}
            type="button"
            onClick={() => setLocation(loc.key)}
            aria-current={loc.key === location ? "page" : undefined}
            className={`rounded-full px-3 py-1 transition-colors ${
              loc.key === location ? "bg-accent text-accent-fg" : "text-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            {loc.label}
            {trees[loc.key]?.items.length ? <span className="ml-1 tabular-nums opacity-70">({trees[loc.key].items.length})</span> : null}
          </button>
        ))}
      </nav>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="card rounded-xl">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
            <input
              value={current.name}
              onChange={(event) => setTrees((all) => ({ ...all, [location]: { ...current, name: event.target.value } }))}
              disabled={!canManage}
              aria-label="Menu name"
              className="min-w-40 rounded border border-transparent bg-transparent px-1 text-sm font-semibold text-fg outline-none hover:border-line-strong focus:border-accent"
            />
            <span className="text-xs text-faint">{current.items.length} top-level {current.items.length === 1 ? "item" : "items"}</span>
            {canManage ? (
              <span className="ml-auto flex items-center gap-2">
                <button type="button" onClick={() => setAdding((open) => !open)} className="btn-secondary rounded-lg px-3 py-1.5 text-xs">
                  {adding ? "Close" : "Add item"}
                </button>
                <button type="button" onClick={save} disabled={pending || !dirty} className="btn-primary rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-60">
                  {pending ? "Saving…" : dirty ? "Save menu" : "Saved"}
                </button>
              </span>
            ) : null}
          </div>

          <div className="p-3">
            {current.items.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted">
                Nothing in this menu yet.{canManage ? " Add a page, a post, a category or a link." : ""}
              </p>
            ) : (
              <ol className="space-y-1">
                {current.items.map((item, index) => (
                  <Row
                    key={item.key}
                    item={item}
                    depth={0}
                    index={index}
                    siblings={current.items.length}
                    editing={editing}
                    canManage={canManage}
                    onEdit={setEditing}
                    onMove={move}
                    onIndent={indent}
                    onOutdent={outdent}
                    onRemove={remove}
                    onPatch={patch}
                    choices={{ pages, posts, categories }}
                  />
                ))}
              </ol>
            )}
          </div>

          {canManage && current.items.length ? (
            <div className="border-t border-line-soft px-5 py-2 text-right">
              <button type="button" onClick={destroy} disabled={pending} className="text-xs text-red-700 hover:underline dark:text-red-300">
                Empty this menu
              </button>
            </div>
          ) : null}
        </section>

        <aside>
          {canManage && adding ? (
            <AddPanel
              choices={{ pages, posts, categories }}
              onAdd={(item) => {
                mutate((items) => items.push(item));
                setAdding(false);
              }}
            />
          ) : (
            <div className="card rounded-xl p-4 text-xs text-muted">
              <p className="font-medium text-fg">How this works</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>Add pages, posts, categories or custom links.</li>
                <li>Use ↑ ↓ to reorder and → ← to nest an item under the one above it.</li>
                <li>Nothing changes on the site until you save the menu.</li>
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({
  item,
  depth,
  index,
  siblings,
  editing,
  canManage,
  onEdit,
  onMove,
  onIndent,
  onOutdent,
  onRemove,
  onPatch,
  choices,
}: {
  item: Item;
  depth: number;
  index: number;
  siblings: number;
  editing: string | null;
  canManage: boolean;
  onEdit: (key: string | null) => void;
  onMove: (key: string, delta: -1 | 1) => void;
  onIndent: (key: string) => void;
  onOutdent: (key: string) => void;
  onRemove: (key: string) => void;
  onPatch: (key: string, changes: Partial<Omit<Item, "key" | "children">>) => void;
  choices: { pages: Choice[]; posts: Choice[]; categories: Choice[] };
}) {
  const open = editing === item.key;
  const small = "rounded border border-line-strong px-1.5 py-0.5 text-[11px] text-fg hover:border-accent hover:bg-surface-2 disabled:opacity-30";
  return (
    <li>
      <div className="rounded-lg border border-line-soft bg-surface-2" style={{ marginLeft: `${depth * 24}px` }}>
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
          <span className="font-medium text-fg">{item.label || "(no label)"}</span>
          <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] uppercase text-muted">{item.target.kind}</span>
          <span className="truncate font-mono text-[11px] text-faint">{urlOf(item.target)}</span>
          {canManage ? (
            <span className="ml-auto flex items-center gap-1">
              <button type="button" className={small} title="Move up" disabled={index === 0} onClick={() => onMove(item.key, -1)}>↑</button>
              <button type="button" className={small} title="Move down" disabled={index === siblings - 1} onClick={() => onMove(item.key, 1)}>↓</button>
              <button type="button" className={small} title="Nest under the item above" disabled={index === 0} onClick={() => onIndent(item.key)}>→</button>
              <button type="button" className={small} title="Move out a level" disabled={depth === 0} onClick={() => onOutdent(item.key)}>←</button>
              <button type="button" className={small} onClick={() => onEdit(open ? null : item.key)}>{open ? "Done" : "Edit"}</button>
              <button type="button" className={`${small} text-red-700 dark:text-red-300`} onClick={() => onRemove(item.key)}>Remove</button>
            </span>
          ) : null}
        </div>
        {open ? (
          <div className="grid gap-3 border-t border-line-soft p-3 sm:grid-cols-2">
            <Field label="Label">
              <input value={item.label} onChange={(event) => onPatch(item.key, { label: event.target.value })} className={formField} />
            </Field>
            <Field label="Description" hint="Shown under the label in some menus.">
              <input value={item.description} onChange={(event) => onPatch(item.key, { description: event.target.value })} className={formField} />
            </Field>
            <TargetFields target={item.target} choices={choices} onChange={(target) => onPatch(item.key, { target })} />
            <div className="sm:col-span-2">
              <Toggle
                name={`newtab-${item.key}`}
                label="Open in a new tab"
                defaultChecked={item.openInNewTab}
                onChange={(checked) => onPatch(item.key, { openInNewTab: checked })}
              />
            </div>
          </div>
        ) : null}
      </div>
      {item.children.length ? (
        <ol className="mt-1 space-y-1">
          {item.children.map((child, childIndex) => (
            <Row
              key={child.key}
              item={child}
              depth={depth + 1}
              index={childIndex}
              siblings={item.children.length}
              editing={editing}
              canManage={canManage}
              onEdit={onEdit}
              onMove={onMove}
              onIndent={onIndent}
              onOutdent={onOutdent}
              onRemove={onRemove}
              onPatch={onPatch}
              choices={choices}
            />
          ))}
        </ol>
      ) : null}
    </li>
  );
}

function TargetFields({
  target,
  choices,
  onChange,
}: {
  target: Target;
  choices: { pages: Choice[]; posts: Choice[]; categories: Choice[] };
  onChange: (target: Target) => void;
}) {
  const list = target.kind === "page" ? choices.pages : target.kind === "post" ? choices.posts : target.kind === "category" ? choices.categories : [];
  return (
    <>
      <Field label="Points at">
        <select
          value={target.kind}
          onChange={(event) => {
            const kind = event.target.value as Target["kind"];
            if (kind === "url") onChange({ kind, url: "" });
            else {
              const first = (kind === "page" ? choices.pages : kind === "post" ? choices.posts : choices.categories)[0];
              onChange({ kind, id: first?.id ?? "", path: first?.path ?? "" });
            }
          }}
          className={formField}
        >
          <option value="page">A page</option>
          <option value="post">A post</option>
          <option value="category">A category</option>
          <option value="url">A custom address</option>
        </select>
      </Field>
      {target.kind === "url" ? (
        <Field label="Address" hint="Full URL, or a path such as /contact.">
          <input value={target.url} onChange={(event) => onChange({ kind: "url", url: event.target.value })} placeholder="https://" className={formField} />
        </Field>
      ) : (
        <Field label={target.kind === "page" ? "Page" : target.kind === "post" ? "Post" : "Category"}>
          <select
            value={target.id}
            onChange={(event) => {
              const chosen = list.find((choice) => choice.id === event.target.value);
              onChange({ kind: target.kind, id: event.target.value, path: chosen?.path ?? "" });
            }}
            className={formField}
          >
            {list.length === 0 ? <option value="">— nothing published yet —</option> : null}
            {list.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.label} ({choice.path})
              </option>
            ))}
          </select>
        </Field>
      )}
    </>
  );
}

function AddPanel({
  choices,
  onAdd,
}: {
  choices: { pages: Choice[]; posts: Choice[]; categories: Choice[] };
  onAdd: (item: Item) => void;
}) {
  const [target, setTarget] = useState<Target>(() =>
    choices.pages[0] ? { kind: "page", id: choices.pages[0].id, path: choices.pages[0].path } : { kind: "url", url: "" },
  );
  const [label, setLabel] = useState("");

  const suggested =
    target.kind === "url"
      ? ""
      : (target.kind === "page" ? choices.pages : target.kind === "post" ? choices.posts : choices.categories).find((choice) => choice.id === target.id)?.label ?? "";

  return (
    <form
      className="card space-y-3 rounded-xl p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const finalLabel = label.trim() || suggested;
        if (!finalLabel) return;
        if (target.kind === "url" && !target.url.trim()) return;
        if (target.kind !== "url" && !target.id) return;
        onAdd({ key: nextKey(), label: finalLabel, description: "", target, openInNewTab: false, children: [] });
        setLabel("");
      }}
    >
      <p className="text-sm font-semibold text-fg">Add an item</p>
      <div className="grid gap-3">
        <TargetFields target={target} choices={choices} onChange={setTarget} />
        <Field label="Label" hint={suggested ? `Blank uses “${suggested}”.` : undefined}>
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={suggested} className={formField} />
        </Field>
      </div>
      <button type="submit" className="btn-primary w-full rounded-lg px-3 py-2 text-sm font-medium">
        Add to menu
      </button>
    </form>
  );
}
