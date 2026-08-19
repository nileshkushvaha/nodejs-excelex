"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { FilterBar, type FilterDefinition } from "@/components/filter-bar";
import { FormError } from "@/components/form-field";
import { MasterTable } from "@/components/master-table";
import { Pager } from "@/components/pager";
import { StatusPill } from "@/components/status-pill";
import type {
  ActionResult,
  CmsCollection,
  CmsContentPage,
  CmsContentRow,
  CmsCounts,
  CmsStatus,
  CmsTerm,
} from "@/lib/api";
import { STATUS_LABEL, STATUS_TONE, formatWhen, statusOf } from "./status";
import { previewToken } from "@/app/(app)/content/content-actions";

/**
 * The pages and posts lists, WordPress-shaped on purpose.
 *
 * Anyone who has run a site knows this screen: status tabs with counts along
 * the top, a search and a couple of filters, a table whose title column is the
 * link, and a row of small verbs that appear on hover. Copying the shape is a
 * kindness — the person setting up a client's site should not have to learn a
 * new one — and it fits the masters' FilterBar + MasterTable pair with no
 * bending.
 *
 * The verbs come in as props rather than being imported: the component is
 * shared by two routes whose actions files bind a different collection, and a
 * client component cannot choose an import at runtime.
 */
export interface ContentActions {
  publish: (id: string, at?: string | null) => Promise<ActionResult>;
  unpublish: (id: string) => Promise<ActionResult>;
  archive: (id: string) => Promise<ActionResult>;
  restore: (id: string) => Promise<ActionResult>;
  duplicate: (id: string) => Promise<ActionResult>;
  trash: (id: string) => Promise<ActionResult>;
  destroy: (id: string) => Promise<ActionResult>;
  bulk: (ids: string[], verb: "trash" | "publish" | "restore") => Promise<ActionResult>;
}

const TABS: ReadonlyArray<{ key: "" | CmsStatus; label: string; count: keyof CmsCounts }> = [
  { key: "", label: "All", count: "all" },
  { key: "PUBLISHED", label: "Published", count: "PUBLISHED" },
  { key: "DRAFT", label: "Drafts", count: "DRAFT" },
  { key: "SCHEDULED", label: "Scheduled", count: "SCHEDULED" },
  { key: "ARCHIVED", label: "Archived", count: "ARCHIVED" },
  { key: "TRASH", label: "Trash", count: "TRASH" },
];


export function ContentList({
  collection,
  page,
  counts,
  authors,
  categories,
  canManage,
  canPublish,
  actions,
}: {
  collection: CmsCollection;
  page: CmsContentPage;
  counts: CmsCounts | null;
  authors: ReadonlyArray<{ id: string; fullName: string }>;
  categories: readonly CmsTerm[];
  canManage: boolean;
  canPublish: boolean;
  actions: ContentActions;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | undefined>();

  const noun = collection === "pages" ? { one: "page", many: "pages" } : { one: "post", many: "posts" };
  const status = (params.get("status") ?? "") as "" | CmsStatus;

  const definitions = useMemo<ReadonlyArray<FilterDefinition<CmsContentRow>>>(() => {
    const list: FilterDefinition<CmsContentRow>[] = [
      { kind: "text", key: "search", label: "Search", placeholder: "Title or body text…", span: 3 },
    ];
    if (authors.length) {
      list.push({
        kind: "select",
        key: "authorId",
        label: "Author",
        options: authors.map((author) => ({ value: author.id, label: author.fullName })),
      });
    }
    if (collection === "posts" && categories.length) {
      list.push({
        kind: "select",
        key: "termId",
        label: "Category",
        options: categories.map((term) => ({ value: term.id, label: term.name })),
      });
    }
    list.push({
      kind: "select",
      key: "sort",
      label: "Sort",
      allLabel: "Recently updated",
      options: [
        { value: "published", label: "Recently published" },
        { value: "title", label: "Title" },
      ],
    });
    return list;
  }, [authors, categories, collection]);

  const values = Object.fromEntries(
    definitions.map((definition) => [definition.key, params.get(definition.key) ?? ""]),
  );

  function apply(next: Record<string, string>) {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    query.delete("page");
    startTransition(() => router.replace(`${pathname}?${query.toString()}`));
  }

  function tabHref(key: "" | CmsStatus) {
    const query = new URLSearchParams(params.toString());
    if (key) query.set("status", key);
    else query.delete("status");
    query.delete("page");
    const text = query.toString();
    return text ? `${pathname}?${text}` : pathname;
  }

  function run(work: () => Promise<ActionResult>, after?: (result: ActionResult) => void) {
    setError(undefined);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) setError(result.error ?? "That did not work.");
      else {
        setSelected(new Set());
        after?.(result);
        router.refresh();
      }
    });
  }

  async function openPreview(row: CmsContentRow) {
    if (statusOf(row) === "PUBLISHED") {
      window.open(row.path, "_blank", "noopener");
      return;
    }
    const token = await previewToken(collection, row.id);
    if (!token) {
      setError("Could not get a preview link for that item.");
      return;
    }
    window.open(`${row.path}?preview=${encodeURIComponent(token.token)}`, "_blank", "noopener");
  }

  const allSelected = page.rows.length > 0 && page.rows.every((row) => selected.has(row.id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(page.rows.map((row) => row.id)));
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <FormError message={error} />

      <nav aria-label="Status" className="mb-3 flex flex-wrap gap-1 text-sm">
        {TABS.map((tab) => {
          const active = status === tab.key;
          const count = counts ? counts[tab.count] : null;
          return (
            <Link
              key={tab.key || "all"}
              href={tabHref(tab.key)}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-3 py-1 transition-colors ${
                active ? "bg-accent text-accent-fg" : "text-muted hover:bg-surface-2 hover:text-fg"
              }`}
            >
              {tab.label}
              {count !== null ? (
                <span className={`ml-1 tabular-nums ${active ? "opacity-80" : "text-faint"}`}>({count})</span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <FilterBar
        definitions={definitions}
        values={values}
        onChange={apply}
        active={Object.values(values).some((value) => value !== "")}
        onReset={() => startTransition(() => router.replace(tabHref(status)))}
        total={page.total}
        shown={page.rows.length}
        noun={noun}
        actions={
          canManage ? (
            <Link
              href={`/content/${collection}/new`}
              className="btn-primary rounded-lg px-3 py-2 text-sm font-medium"
            >
              New {noun.one}
            </Link>
          ) : null
        }
      />

      {selected.size ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
          <span className="text-muted">
            {selected.size} selected
          </span>
          {status === "TRASH" ? (
            <BulkButton
              label="Restore"
              onClick={() => run(() => actions.bulk([...selected], "restore"))}
              disabled={!canPublish}
            />
          ) : (
            <>
              {canPublish ? (
                <BulkButton
                  label="Publish"
                  onClick={() => run(() => actions.bulk([...selected], "publish"))}
                />
              ) : null}
              <BulkButton
                label="Move to trash"
                tone="danger"
                disabled={!canPublish}
                onClick={() => run(() => actions.bulk([...selected], "trash"))}
              />
            </>
          )}
          <button
            type="button"
            className="ml-auto text-xs text-muted hover:text-fg"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </div>
      ) : null}

      <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <MasterTable
          rows={page.rows}
          rowKey={(row) => row.id}
          empty={`No ${noun.many} here${status ? " with this status" : ""}.`}
          columns={[
            {
              header: "",
              className: "w-8",
              cell: (row) => (
                <input
                  type="checkbox"
                  aria-label={`Select ${row.title}`}
                  checked={selected.has(row.id)}
                  onChange={() => toggle(row.id)}
                  className="accent-accent"
                />
              ),
            },
            {
              header: "Title",
              cell: (row) => (
                <div className="min-w-56">
                  <Link
                    href={`/content/${collection}/${row.id}`}
                    className="font-medium text-fg hover:text-accent-text hover:underline"
                  >
                    {row.title || "(untitled)"}
                    {statusOf(row) === "DRAFT" ? <span className="text-faint"> — Draft</span> : null}
                    {row.isSticky ? <span className="text-faint"> — Sticky</span> : null}
                  </Link>
                  <p className="mt-0.5 font-mono text-[11px] text-faint">{row.path}</p>
                  <RowActions
                    row={row}
                    collection={collection}
                    canManage={canManage}
                    canPublish={canPublish}
                    onPreview={() => void openPreview(row)}
                    onDuplicate={() =>
                      run(
                        () => actions.duplicate(row.id),
                        (result) => {
                          const created = result.data as { id?: string } | undefined;
                          if (created?.id) router.push(`/content/${collection}/${created.id}`);
                        },
                      )
                    }
                    onTrash={() => run(() => actions.trash(row.id))}
                    onRestore={() => run(() => actions.restore(row.id))}
                    onDestroy={() => {
                      if (window.confirm(`Delete "${row.title}" permanently? This cannot be undone.`))
                        run(() => actions.destroy(row.id));
                    }}
                  />
                </div>
              ),
            },
            {
              header: "Author",
              cell: (row) => <span className="text-xs text-muted">{row.author?.fullName ?? "—"}</span>,
            },
            {
              header: collection === "posts" ? "Categories / tags" : "Parent",
              cell: (row) =>
                collection === "posts" ? (
                  <TermChips terms={row.terms} />
                ) : (
                  <span className="text-xs text-muted">
                    {row.parentId ? row.path.split("/").slice(1, -1).join(" / ") || "—" : "—"}
                  </span>
                ),
            },
            {
              header: "Status",
              cell: (row) => (
                <StatusPill tone={STATUS_TONE[statusOf(row)]}>{STATUS_LABEL[statusOf(row)]}</StatusPill>
              ),
            },
            {
              header: "Date",
              cell: (row) => <DateCell row={row} />,
            },
          ]}
          stickyLastColumn={false}
        />
      </div>

      <div className="mt-2 flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all on this page" className="accent-accent" />
        Select all on this page
      </div>

      <Pager page={page.page} pageCount={page.pageCount} total={page.total} pageSize={page.pageSize} />
    </>
  );
}

function BulkButton({
  label,
  onClick,
  disabled,
  tone,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded border border-line-strong px-2 py-1 text-xs transition-colors disabled:opacity-50 ${
        tone === "danger"
          ? "text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/50"
          : "text-fg hover:border-accent hover:bg-surface-2"
      }`}
    >
      {label}
    </button>
  );
}

function RowActions({
  row,
  collection,
  canManage,
  canPublish,
  onPreview,
  onDuplicate,
  onTrash,
  onRestore,
  onDestroy,
}: {
  row: CmsContentRow;
  collection: CmsCollection;
  canManage: boolean;
  canPublish: boolean;
  onPreview: () => void;
  onDuplicate: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onDestroy: () => void;
}) {
  const status = statusOf(row);
  const link = "text-xs text-muted hover:text-accent-text hover:underline";
  const danger = "text-xs text-red-700 hover:underline dark:text-red-300";
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 opacity-70 transition-opacity group-hover:opacity-100">
      <Link href={`/content/${collection}/${row.id}`} className={link}>
        {canManage ? "Edit" : "Open"}
      </Link>
      <button type="button" onClick={onPreview} className={link}>
        {status === "PUBLISHED" ? "View" : "Preview"}
      </button>
      {canManage && status !== "TRASH" ? (
        <button type="button" onClick={onDuplicate} className={link}>
          Duplicate
        </button>
      ) : null}
      {canPublish ? (
        status === "TRASH" ? (
          <>
            <button type="button" onClick={onRestore} className={link}>
              Restore
            </button>
            <button type="button" onClick={onDestroy} className={danger}>
              Delete permanently
            </button>
          </>
        ) : status === "ARCHIVED" ? (
          <>
            <button type="button" onClick={onRestore} className={link}>
              Restore
            </button>
            <button type="button" onClick={onTrash} className={danger}>
              Trash
            </button>
          </>
        ) : (
          <button type="button" onClick={onTrash} className={danger}>
            Trash
          </button>
        )
      ) : null}
    </div>
  );
}

function TermChips({ terms }: { terms: CmsContentRow["terms"] }) {
  if (!terms.length) return <span className="text-xs text-faint">—</span>;
  const categories = terms.filter((term) => term.taxonomy === "CATEGORY");
  const tags = terms.filter((term) => term.taxonomy === "TAG");
  return (
    <div className="max-w-56 text-xs">
      {categories.length ? <p className="text-fg">{categories.map((term) => term.name).join(", ")}</p> : null}
      {tags.length ? (
        <p className="text-faint">{tags.map((term) => `#${term.slug}`).join(" ")}</p>
      ) : null}
    </div>
  );
}

function DateCell({ row }: { row: CmsContentRow }) {
  const status = statusOf(row);
  const [label, value] =
    status === "PUBLISHED"
      ? ["Published", row.publishedAt]
      : status === "SCHEDULED"
        ? ["Scheduled", row.scheduledFor]
        : ["Updated", row.updatedAt];
  return (
    <div className="text-xs">
      <p className="text-faint">{label}</p>
      <p className="tabular-nums text-muted">{formatWhen(value)}</p>
    </div>
  );
}
