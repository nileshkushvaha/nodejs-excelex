"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { createTerm, deleteTerm, mergeTerm, updateTerm } from "@/app/(app)/content/terms-actions";
import { Field, FormError, formField } from "@/components/form-field";
import { FormPanel } from "@/components/form-page";
import { MasterTable } from "@/components/master-table";
import type { ActionResult, CmsTaxonomy, CmsTerm } from "@/lib/api";
import { slugify } from "./slug-field";

/**
 * Categories and tags: one screen, two taxonomies.
 *
 * The list is small enough to come down whole (a site with more than a few
 * hundred terms has a different problem), so filtering is in the browser and
 * editing is inline — a term is a name, a slug and a sentence. Merge exists
 * because tags accrete duplicates ("logistics", "Logistics", "logistic") and
 * the fix is to fold them, moving the posts, not to delete and lose them.
 * Categories add a parent, and the table shows the tree by indenting.
 */
export function TermsManager({
  taxonomy,
  terms,
  canManage,
}: {
  taxonomy: CmsTaxonomy;
  terms: readonly CmsTerm[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CmsTerm | "new" | null>(null);
  const [merging, setMerging] = useState<CmsTerm | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  const noun = taxonomy === "CATEGORY" ? "category" : "tag";
  const nouns = taxonomy === "CATEGORY" ? "categories" : "tags";

  // Categories in tree order with a depth; tags alphabetical.
  const ordered = useMemo(() => {
    if (taxonomy === "TAG") {
      return terms.slice().sort((a, b) => a.name.localeCompare(b.name)).map((term) => ({ term, depth: 0 }));
    }
    const ids = new Set(terms.map((term) => term.id));
    const children = (parentId: string | null): CmsTerm[] =>
      terms
        .filter((term) => (term.parentId && ids.has(term.parentId) ? term.parentId : null) === parentId)
        .sort((a, b) => a.name.localeCompare(b.name));
    const walk = (parentId: string | null, depth: number): Array<{ term: CmsTerm; depth: number }> =>
      children(parentId).flatMap((term) => [{ term, depth }, ...walk(term.id, depth + 1)]);
    return walk(null, 0);
  }, [terms, taxonomy]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return ordered;
    return ordered.filter(({ term }) => `${term.name} ${term.slug} ${term.description ?? ""}`.toLowerCase().includes(needle));
  }, [ordered, search]);

  function run(work: () => Promise<ActionResult>, after?: () => void) {
    setError(undefined);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) setError(result.error);
      else {
        after?.();
        router.refresh();
      }
    });
  }

  return (
    <>
      <FormError message={error} />

      <div className="card mb-4 flex flex-wrap items-center gap-3 rounded-xl p-4">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={`Find a ${noun}…`}
          className={`${formField} max-w-sm`}
          aria-label="Search"
        />
        <span className="text-xs text-muted">
          {shown.length === terms.length
            ? `${terms.length} ${terms.length === 1 ? noun : nouns}`
            : `${shown.length} of ${terms.length} ${nouns}`}
        </span>
        {canManage ? (
          <button
            type="button"
            onClick={() => setEditing((current) => (current ? null : "new"))}
            className="btn-primary ml-auto rounded-lg px-3 py-2 text-sm font-medium"
          >
            {editing ? "Cancel" : `New ${noun}`}
          </button>
        ) : null}
      </div>

      {editing ? (
        <div className="mb-4" key={editing === "new" ? "new" : editing.id}>
          <TermForm
            taxonomy={taxonomy}
            term={editing === "new" ? null : editing}
            others={terms.filter((term) => editing === "new" || term.id !== editing.id)}
            onDone={() => {
              setEditing(null);
              router.refresh();
            }}
          />
        </div>
      ) : null}

      {merging ? (
        <MergeForm
          source={merging}
          targets={terms.filter((term) => term.id !== merging.id)}
          noun={noun}
          pending={pending}
          onCancel={() => setMerging(null)}
          onMerge={(intoId) => run(() => mergeTerm(merging.id, intoId), () => setMerging(null))}
        />
      ) : null}

      <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <MasterTable
          rows={shown}
          rowKey={({ term }) => term.id}
          empty={search ? `No ${nouns} match.` : `No ${nouns} yet.`}
          columns={[
            {
              header: "Name",
              cell: ({ term, depth }) => (
                <span className="text-fg" style={{ paddingLeft: `${depth * 16}px` }}>
                  {depth ? <span className="text-faint">— </span> : null}
                  {term.name}
                </span>
              ),
            },
            {
              header: "Slug",
              cell: ({ term }) => <span className="font-mono text-xs text-muted">{term.path || term.slug}</span>,
            },
            {
              header: "Description",
              cell: ({ term }) => <span className="line-clamp-1 max-w-md text-xs text-muted">{term.description ?? "—"}</span>,
            },
            {
              header: "Posts",
              className: "text-right",
              cell: ({ term }) => <span className="tabular-nums text-xs text-muted">{term.count}</span>,
            },
            {
              header: "Action",
              className: "text-right",
              cell: ({ term }) =>
                canManage ? (
                  <span className="flex justify-end gap-2">
                    <button type="button" onClick={() => setEditing(term)} className="rounded border border-line-strong px-2 py-1 text-xs text-fg transition-colors hover:border-accent hover:bg-surface-2">
                      Edit
                    </button>
                    <button type="button" onClick={() => setMerging(term)} className="rounded border border-line-strong px-2 py-1 text-xs text-fg transition-colors hover:border-accent hover:bg-surface-2">
                      Merge
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Delete "${term.name}"? Posts keep their other ${nouns}.`)) run(() => deleteTerm(term.id));
                      }}
                      className="rounded border border-line-strong px-2 py-1 text-xs text-red-700 transition-colors hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/50"
                    >
                      Delete
                    </button>
                  </span>
                ) : null,
            },
          ]}
        />
      </div>
    </>
  );
}

function TermForm({
  taxonomy,
  term,
  others,
  onDone,
}: {
  taxonomy: CmsTaxonomy;
  term: CmsTerm | null;
  others: readonly CmsTerm[];
  onDone: () => void;
}) {
  const [name, setName] = useState(term?.name ?? "");
  const [slug, setSlug] = useState(term?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(term));
  const [description, setDescription] = useState(term?.description ?? "");
  const [parentId, setParentId] = useState(term?.parentId ?? "");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const noun = taxonomy === "CATEGORY" ? "category" : "tag";

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const input = {
        taxonomy,
        name: name.trim(),
        slug: slug || null,
        description: description || null,
        parentId: taxonomy === "CATEGORY" ? parentId || null : null,
      };
      const response = term ? await updateTerm(term.id, input) : await createTerm(input);
      setResult(response);
      if (response.ok) onDone();
    });
  }

  return (
    <form onSubmit={submit}>
      <FormError result={result} />
      <FormPanel title={term ? `Edit ${term.name}` : `New ${noun}`}>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Name" error={result?.fieldErrors?.name}>
            <input
              name="name"
              required
              maxLength={80}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (!slugTouched) setSlug(slugify(event.target.value));
              }}
              className={formField}
            />
          </Field>
          <Field label="Slug" hint="Used in the address." error={result?.fieldErrors?.slug}>
            <input
              name="slug"
              value={slug}
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(slugify(event.target.value));
              }}
              className={`${formField} font-mono`}
            />
          </Field>
          {taxonomy === "CATEGORY" ? (
            <Field label="Parent">
              <select name="parentId" value={parentId} onChange={(event) => setParentId(event.target.value)} className={formField}>
                <option value="">— None —</option>
                {others.map((other) => (
                  <option key={other.id} value={other.id}>
                    {other.path || other.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Description" span={taxonomy === "CATEGORY" ? undefined : 2}>
            <input name="description" maxLength={300} value={description} onChange={(event) => setDescription(event.target.value)} className={formField} />
          </Field>
          <div className="flex items-end sm:col-start-4">
            <button type="submit" disabled={pending} className="btn-primary w-full rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60">
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </FormPanel>
    </form>
  );
}

function MergeForm({
  source,
  targets,
  noun,
  pending,
  onCancel,
  onMerge,
}: {
  source: CmsTerm;
  targets: readonly CmsTerm[];
  noun: string;
  pending: boolean;
  onCancel: () => void;
  onMerge: (intoId: string) => void;
}) {
  const [intoId, setIntoId] = useState("");
  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/50">
      <p className="text-amber-800 dark:text-amber-300">
        Merge <strong>{source.name}</strong> into another {noun}. Its {source.count} post{source.count === 1 ? "" : "s"} move across and
        the {noun} itself is deleted.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select value={intoId} onChange={(event) => setIntoId(event.target.value)} className={`${formField} max-w-xs`} aria-label="Merge into">
          <option value="">— Choose the {noun} to keep —</option>
          {targets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.path || target.name} ({target.count})
            </option>
          ))}
        </select>
        <button type="button" disabled={!intoId || pending} onClick={() => onMerge(intoId)} className="btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60">
          Merge
        </button>
        <button type="button" onClick={onCancel} className="text-xs text-muted hover:text-fg">
          Cancel
        </button>
      </div>
    </div>
  );
}
