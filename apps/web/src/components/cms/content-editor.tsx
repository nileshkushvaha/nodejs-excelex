"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  previewToken,
  publishContent,
  saveContent,
  transitionContent,
  trashContent,
} from "@/app/(app)/content/content-actions";
import { Field, FormError, formField } from "@/components/form-field";
import { Toggle } from "@/components/toggle";
import type {
  ActionResult,
  CmsCollection,
  CmsContentDetail,
  CmsContentInput,
  CmsContentRow,
  CmsMediaRef,
  CmsStatus,
  CmsTerm,
} from "@/lib/api";
import { statusOf } from "./status";
import { MediaPicker } from "./media-picker";
import { PublishCard } from "./publish-card";
import { RevisionsPanel } from "./revisions-panel";
import { RichTextEditor } from "./rich-text-editor";
import { SeoPanel, type SeoValues } from "./seo-panel";
import { SlugField, slugify } from "./slug-field";
import { CategoryPicker, TagPicker } from "./term-picker";

/**
 * The page/post editor: WordPress's two columns, without WordPress.
 *
 * All of the editable state lives in one object here rather than in a form's
 * inputs, for three reasons that all come back to saving. Autosave needs to
 * know whether anything changed since the last save — a JSON snapshot of the
 * object answers that in one comparison. Publish must save first, so the
 * thing that goes live is the thing on screen, and it needs the same body
 * the save button builds. And the API's row comes back after every write
 * with the status, path and revision count the sidebar shows, which get
 * merged in without touching what the person is typing.
 *
 * A new item is created by its first save (button or autosave, once it has a
 * title) and the URL is rewritten in place to the new id — navigating would
 * remount the editor and drop the cursor.
 */
interface Draft {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  parentId: string;
  menuOrder: number;
  template: string;
  featuredMedia: CmsMediaRef | null;
  isSticky: boolean;
  categoryIds: string[];
  tags: Array<Pick<CmsTerm, "id" | "name" | "slug">>;
  seo: SeoValues;
}

interface Live {
  status: CmsStatus;
  path: string;
  publishedAt: string | null;
  scheduledFor: string | null;
  revisionCount: number;
  author: string | null;
}

const TEMPLATES = [
  { value: "default", label: "Default — heading and body" },
  { value: "landing", label: "Landing — full-width hero" },
  { value: "full-width", label: "Full width — no sidebar" },
];

const AUTOSAVE_MS = 30_000;

function draftFrom(content: CmsContentDetail | null): Draft {
  return {
    title: content?.title ?? "",
    slug: content?.slug ?? "",
    excerpt: content?.excerpt ?? "",
    body: content?.body ?? "",
    parentId: content?.parentId ?? "",
    menuOrder: content?.menuOrder ?? 0,
    template: content?.template ?? "default",
    featuredMedia: content?.featuredMedia ?? null,
    isSticky: content?.isSticky ?? false,
    categoryIds: (content?.terms ?? []).filter((term) => term.taxonomy === "CATEGORY").map((term) => term.id),
    tags: (content?.terms ?? []).filter((term) => term.taxonomy === "TAG").map(({ id, name, slug }) => ({ id, name, slug })),
    seo: {
      metaTitle: content?.metaTitle ?? "",
      metaDescription: content?.metaDescription ?? "",
      canonicalUrl: content?.canonicalUrl ?? "",
      noIndex: content?.noIndex ?? false,
      ogImage: content?.ogImage ?? null,
    },
  };
}

function liveFrom(content: CmsContentDetail | CmsContentRow | null, fallbackPath: string): Live {
  return {
    status: content ? statusOf(content) : "DRAFT",
    path: content?.path ?? fallbackPath,
    publishedAt: content?.publishedAt ?? null,
    scheduledFor: content?.scheduledFor ?? null,
    revisionCount: content?.revisionCount ?? 0,
    author: content?.author?.fullName ?? null,
  };
}

function inputFrom(draft: Draft, collection: CmsCollection): CmsContentInput {
  const shared: CmsContentInput = {
    title: draft.title.trim(),
    slug: draft.slug || undefined,
    excerpt: draft.excerpt || null,
    body: draft.body,
    featuredMediaId: draft.featuredMedia?.id ?? null,
    metaTitle: draft.seo.metaTitle || null,
    metaDescription: draft.seo.metaDescription || null,
    canonicalUrl: draft.seo.canonicalUrl || null,
    noIndex: draft.seo.noIndex,
    ogImageMediaId: draft.seo.ogImage?.id ?? null,
  };
  return collection === "pages"
    ? { ...shared, parentId: draft.parentId || null, menuOrder: draft.menuOrder, template: draft.template }
    : { ...shared, isSticky: draft.isSticky, termIds: [...draft.categoryIds, ...draft.tags.map((tag) => tag.id)] };
}

export function ContentEditor({
  collection,
  content,
  categories,
  parents,
  blogPath,
  siteTitle,
  authorName,
  canManage,
  canPublish,
  canCreateTerms,
}: {
  collection: CmsCollection;
  content: CmsContentDetail | null;
  categories: readonly CmsTerm[];
  /** Pages that can be a parent — every page but this one. */
  parents: ReadonlyArray<{ id: string; title: string; path: string }>;
  blogPath: string;
  siteTitle?: string;
  /** Who will be recorded as author of a new item — the signed-in person. */
  authorName: string;
  canManage: boolean;
  canPublish: boolean;
  canCreateTerms: boolean;
}) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(content?.id ?? null);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(content));
  const [live, setLive] = useState<Live>(() => liveFrom(content, ""));
  const [savedSnapshot, setSavedSnapshot] = useState(() => (content ? JSON.stringify(draftFrom(content)) : ""));
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [featuredPicker, setFeaturedPicker] = useState(false);
  const [slugTouched, setSlugTouched] = useState(Boolean(content?.slug));
  const reloadOnNext = useRef(false);

  const isNew = id === null;
  const readOnly = !canManage;
  const dirty = JSON.stringify(draft) !== savedSnapshot;

  const prefix = useMemo(() => {
    if (collection === "posts") return `${blogPath.replace(/\/$/, "")}/`;
    const parent = parents.find((entry) => entry.id === draft.parentId);
    return parent ? `${parent.path.replace(/\/$/, "")}/` : "/";
  }, [collection, blogPath, parents, draft.parentId]);

  const update = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);

  // A title typed into a new item proposes its slug until the slug is edited
  // by hand; after that the two part ways, as they should.
  function setTitle(title: string) {
    setDraft((current) => ({
      ...current,
      title,
      slug: slugTouched ? current.slug : slugify(title),
    }));
  }

  // The route re-renders after a restore with the restored content; take it
  // as the new state then, and only then — any other prop change is the
  // echo of our own save.
  useEffect(() => {
    if (!reloadOnNext.current || !content) return;
    reloadOnNext.current = false;
    const next = draftFrom(content);
    setDraft(next);
    setSavedSnapshot(JSON.stringify(next));
    setLive(liveFrom(content, ""));
  }, [content]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = useCallback(
    async (silent = false): Promise<string | null> => {
      if (readOnly || saving) return id;
      if (!draft.title.trim()) {
        if (!silent) setResult({ ok: false, error: "Give it a title before saving." });
        return null;
      }
      setSaving(true);
      if (!silent) setResult(null);
      const response = await saveContent(collection, id, inputFrom(draft, collection));
      setSaving(false);
      if (!response.ok) {
        setResult(response);
        return null;
      }
      setSavedSnapshot(JSON.stringify(draft));
      setSavedAt(new Date());
      if (id) {
        const row = response.data as CmsContentRow | undefined;
        if (row && typeof row === "object" && "status" in row) setLive(liveFrom(row, live.path));
        return id;
      }
      const created = response.data as { id: string; slug: string; path: string } | undefined;
      if (created?.id) {
        setId(created.id);
        setSlugTouched(true);
        setDraft((current) => ({ ...current, slug: created.slug }));
        setLive((current) => ({ ...current, path: created.path, author: current.author ?? authorName, revisionCount: 1 }));
        window.history.replaceState(null, "", `/content/${collection}/${created.id}`);
        return created.id;
      }
      return null;
    },
    [readOnly, saving, draft, collection, id, live.path, authorName],
  );

  // Autosave: every 30 s, only when there is something new to save. The
  // interval is re-armed when the callback changes so it always sees the
  // latest draft; the check inside keeps a quiet editor from writing.
  useEffect(() => {
    if (readOnly) return;
    const timer = setInterval(() => {
      if (dirty && !saving) void save(true);
    }, AUTOSAVE_MS);
    return () => clearInterval(timer);
  }, [dirty, saving, save, readOnly]);

  function applyRow(response: ActionResult) {
    if (!response.ok) {
      setResult(response);
      return false;
    }
    const row = response.data as CmsContentRow | undefined;
    if (row && typeof row === "object" && "status" in row) setLive(liveFrom(row, live.path));
    setResult(null);
    return true;
  }

  async function publish(at: string | null) {
    const target = dirty || isNew ? await save() : id;
    if (!target) return;
    setSaving(true);
    applyRow(await publishContent(collection, target, at));
    setSaving(false);
  }

  async function transition(verb: "unpublish" | "archive" | "restore") {
    if (!id) return;
    setSaving(true);
    applyRow(await transitionContent(collection, id, verb));
    setSaving(false);
  }

  async function trash() {
    if (!id) return;
    if (!window.confirm("Move this to the trash? It can be restored from the Trash tab.")) return;
    setSaving(true);
    const response = await trashContent(collection, id);
    setSaving(false);
    if (!response.ok) {
      setResult(response);
      return;
    }
    setSavedSnapshot(JSON.stringify(draft));
    router.push(`/content/${collection}`);
  }

  async function preview() {
    const target = dirty || isNew ? await save() : id;
    if (!target) return;
    if (live.status === "PUBLISHED" && !dirty) {
      window.open(live.path, "_blank", "noopener");
      return;
    }
    const token = await previewToken(collection, target);
    if (!token) {
      setResult({ ok: false, error: "Could not get a preview link." });
      return;
    }
    window.open(`${live.path}?preview=${encodeURIComponent(token.token)}`, "_blank", "noopener");
  }

  const noun = collection === "pages" ? "page" : "post";

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-4">
        <FormError result={result} />

        <div className="card rounded-xl p-5">
          <input
            value={draft.title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={`Add a ${noun} title`}
            maxLength={200}
            readOnly={readOnly}
            aria-label="Title"
            className="w-full border-0 bg-transparent text-2xl font-semibold tracking-tight text-fg outline-none placeholder:text-faint"
          />
          <div className="mt-2">
            <SlugField
              prefix={prefix}
              slug={draft.slug}
              onChange={(slug) => {
                setSlugTouched(true);
                update("slug", slug);
              }}
              disabled={readOnly}
              href={live.status === "PUBLISHED" ? live.path : null}
            />
          </div>
        </div>

        <RichTextEditor value={draft.body} onChange={(html) => update("body", html)} disabled={readOnly} />

        <div className="card rounded-xl p-5">
          <Field label="Excerpt" hint="A short summary for listings and search results. Left blank, the first lines of the body are used.">
            <textarea
              name="excerpt"
              value={draft.excerpt}
              onChange={(event) => update("excerpt", event.target.value)}
              rows={3}
              maxLength={500}
              disabled={readOnly}
              className={formField}
            />
          </Field>
        </div>

        <SeoPanel
          values={draft.seo}
          onChange={(seo) => update("seo", seo)}
          fallbackTitle={draft.title}
          fallbackDescription={draft.excerpt}
          path={live.path || `${prefix}${draft.slug}`}
          siteTitle={siteTitle}
          disabled={readOnly}
        />
      </div>

      <aside className="space-y-4">
        <PublishCard
          status={live.status}
          isNew={isNew}
          publishedAt={live.publishedAt}
          scheduledFor={live.scheduledFor}
          dirty={dirty}
          saving={saving}
          savedAt={savedAt}
          canManage={canManage}
          canPublish={canPublish}
          onSave={() => void save()}
          onPublish={(at) => void publish(at)}
          onUnpublish={() => void transition("unpublish")}
          onArchive={() => void transition("archive")}
          onRestore={() => void transition("restore")}
          onTrash={() => void trash()}
          onPreview={() => void preview()}
        />

        <SideCard title="Author">
          <p className="text-sm text-fg">{live.author ?? authorName}</p>
          {isNew ? <p className="text-xs text-faint">Set when first saved.</p> : null}
        </SideCard>

        <SideCard title="Featured image">
          {draft.featuredMedia ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={draft.featuredMedia.url}
                alt={draft.featuredMedia.altText ?? ""}
                className="w-full rounded-lg border border-line object-cover"
              />
              {!readOnly ? (
                <div className="flex gap-3 text-xs">
                  <button type="button" onClick={() => setFeaturedPicker(true)} className="text-accent-text hover:underline">
                    Replace
                  </button>
                  <button type="button" onClick={() => update("featuredMedia", null)} className="text-muted hover:text-fg">
                    Remove
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              disabled={readOnly}
              onClick={() => setFeaturedPicker(true)}
              className="btn-secondary w-full rounded-lg px-3 py-2 text-xs disabled:opacity-50"
            >
              Set featured image
            </button>
          )}
        </SideCard>

        {collection === "posts" ? (
          <>
            <SideCard title="Categories">
              <CategoryPicker
                terms={categories}
                selected={draft.categoryIds}
                onChange={(ids) => update("categoryIds", ids)}
                canCreate={canCreateTerms}
                disabled={readOnly}
              />
            </SideCard>
            <SideCard title="Tags">
              <TagPicker
                selected={draft.tags}
                onChange={(tags) => update("tags", tags)}
                canCreate={canCreateTerms}
                disabled={readOnly}
              />
            </SideCard>
            <SideCard title="Listing">
              <Toggle
                name="isSticky"
                label="Stick to the top"
                description="Shown before other posts on the blog."
                defaultChecked={draft.isSticky}
                disabled={readOnly}
                onChange={(checked) => update("isSticky", checked)}
              />
            </SideCard>
          </>
        ) : (
          <SideCard title="Page attributes">
            <div className="space-y-3">
              <Field label="Parent page">
                <select
                  name="parentId"
                  value={draft.parentId}
                  onChange={(event) => update("parentId", event.target.value)}
                  disabled={readOnly}
                  className={formField}
                >
                  <option value="">— No parent (top level) —</option>
                  {parents.map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.title} ({page.path})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Order" hint="Lower numbers come first in menus and sibling lists.">
                <input
                  name="menuOrder"
                  type="number"
                  value={draft.menuOrder}
                  onChange={(event) => update("menuOrder", Number(event.target.value) || 0)}
                  disabled={readOnly}
                  className={`${formField} tabular-nums`}
                />
              </Field>
              <Field label="Template">
                <select
                  name="template"
                  value={draft.template}
                  onChange={(event) => update("template", event.target.value)}
                  disabled={readOnly}
                  className={formField}
                >
                  {TEMPLATES.map((template) => (
                    <option key={template.value} value={template.value}>
                      {template.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </SideCard>
        )}

        <RevisionsPanel
          collection={collection}
          contentId={id}
          count={live.revisionCount}
          canManage={canManage}
          onRestored={() => {
            reloadOnNext.current = true;
            router.refresh();
          }}
        />
      </aside>

      <MediaPicker
        open={featuredPicker}
        accept="image"
        onClose={() => setFeaturedPicker(false)}
        onSelect={(media) => {
          setFeaturedPicker(false);
          update("featuredMedia", {
            id: media.id,
            url: media.url,
            altText: media.altText,
            width: media.width,
            height: media.height,
          });
        }}
      />
    </div>
  );
}

function SideCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card rounded-xl">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
