import Link from "next/link";
import type { ReactNode } from "react";

import { CmsImage } from "./cms-page";
import { PageHeader } from "./page-header";

import {
  getPublicCategories,
  getPublicPosts,
  getPublicTags,
  type PublicCategory,
  type PublicPostRow,
} from "@/lib/api";

/**
 * The blog, as the public site shows it.
 *
 * One listing component serves the index, the paged index, a category and a
 * tag: they differ only in the query they send and the heading they open
 * with, and four pages that each laid out cards, pagination and a sidebar
 * would drift apart within a month. The route files are therefore thin —
 * they parse their params and call BlogListing.
 *
 * `/blog` is fixed in the router even though the CMS lets a client change
 * `blogPath`: Next routes are files, not settings, so a client who renames the
 * path gets working API links but this app still answers at /blog. The
 * limitation is deliberate and noted in the contract; the fix is a rewrite
 * once a client actually asks for it.
 */
export const BLOG_BASE = "/blog";

export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

/** The listing's arguments — where it is, and what it lists. */
export interface ListingSpec {
  /** Query sent to public/posts (without page). */
  query: URLSearchParams;
  page: number;
  /** Page 1 of this listing. */
  pageBase: string;
  /**
   * Where page N lives. The index nests it (`/blog/page/2`); the archives use
   * a query (`?page=2`) because a `/page/` segment under a slug would collide
   * with a category or tag that happens to be slugged "page".
   */
  pageHref?: (n: number) => string;
  eyebrow: string;
  title: string;
  intro?: string;
}

export async function BlogListing(spec: ListingSpec) {
  const params = new URLSearchParams(spec.query);
  params.set("page", String(spec.page));
  const [posts, sidebar] = await Promise.all([getPublicPosts(params.toString()), loadSidebar()]);

  const empty = !posts || posts.rows.length === 0;

  return (
    <>
      <PageHeader eyebrow={spec.eyebrow} title={spec.title} {...(spec.intro ? { intro: spec.intro } : {})} />

      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 lg:grid-cols-[1fr_18rem] sm:py-20">
        <div>
          {empty ? (
            <EmptyState page={spec.page} pageBase={spec.pageBase} reachable={posts !== null} />
          ) : (
            <>
              <ul className="grid gap-8 sm:grid-cols-2">
                {posts.rows.map((post) => (
                  <li key={post.id}>
                    <PostCard post={post} />
                  </li>
                ))}
              </ul>
              <Pagination
                page={posts.page}
                pageCount={posts.pageCount}
                pageHref={spec.pageHref ?? ((n) => (n <= 1 ? spec.pageBase : `${spec.pageBase}/page/${n}`))}
              />
            </>
          )}
        </div>

        <BlogSidebar {...sidebar} />
      </div>
    </>
  );
}

function EmptyState({ page, pageBase, reachable }: { page: number; pageBase: string; reachable: boolean }) {
  return (
    <div className="glass rounded-2xl p-10 text-center">
      <h2 className="text-lg font-semibold text-fg">
        {page > 1 ? "There is no page this far in" : "Nothing published here yet"}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
        {page > 1
          ? "The blog does not have that many pages. Start from the first one."
          : reachable
            ? "When there is news worth reading, it will appear here."
            : "The blog could not be loaded just now. Try again in a moment."}
      </p>
      {page > 1 ? (
        <Link href={pageBase} className="btn-primary mt-6 inline-block rounded-xl px-5 py-2.5 text-sm font-medium">
          Back to the first page
        </Link>
      ) : null}
    </div>
  );
}

export function PostCard({ post }: { post: PublicPostRow }) {
  return (
    <article className="glass glass-lift flex h-full flex-col overflow-hidden rounded-2xl">
      {post.featuredImage ? (
        <Link href={post.path} className="block aspect-[16/9] overflow-hidden border-b border-line" tabIndex={-1}>
          <CmsImage image={post.featuredImage} className="h-full w-full object-cover" />
        </Link>
      ) : null}
      <div className="flex flex-1 flex-col p-6">
        {post.categories.length ? (
          <ul className="mb-3 flex flex-wrap gap-2">
            {post.categories.map((category) => (
              <li key={category.slug}>
                <Link
                  href={`${BLOG_BASE}/category/${category.slug}`}
                  className="rounded-full border border-line bg-surface/60 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-accent-text"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <h2 className="text-lg font-semibold leading-snug text-fg">
          <Link href={post.path} className="hover:text-accent-text">
            {post.isSticky ? <span className="mr-1.5 text-accent-text" title="Pinned">★</span> : null}
            {post.title}
          </Link>
        </h2>
        {post.excerpt ? <p className="mt-2 text-sm leading-relaxed text-muted">{post.excerpt}</p> : null}
        <PostMeta post={post} className="mt-auto pt-5" />
      </div>
    </article>
  );
}

export function PostMeta({ post, className = "" }: { post: PublicPostRow; className?: string }) {
  const parts = [
    post.author?.fullName,
    formatDate(post.publishedAt),
    post.readingMinutes ? `${post.readingMinutes} min read` : null,
  ].filter(Boolean);
  return (
    <p className={`text-xs text-faint ${className}`}>
      {parts.map((part, index) => (
        <span key={`${part}-${index}`}>
          {index > 0 ? <span aria-hidden> · </span> : null}
          {part}
        </span>
      ))}
    </p>
  );
}

export function Pagination({
  page,
  pageCount,
  pageHref: href,
}: {
  page: number;
  pageCount: number;
  pageHref: (n: number) => string;
}) {
  if (pageCount <= 1) return null;
  const around = [1, page - 1, page, page + 1, pageCount].filter(
    (n, index, all) => n >= 1 && n <= pageCount && all.indexOf(n) === index,
  );

  return (
    <nav aria-label="Pages" className="mt-12 flex flex-wrap items-center justify-center gap-2 text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)} className="btn-secondary rounded-xl px-4 py-2" rel="prev">
          ← Newer
        </Link>
      ) : null}
      {around.map((n, index) => (
        <span key={n} className="flex items-center gap-2">
          {index > 0 && n - (around[index - 1] ?? 0) > 1 ? <span className="text-faint">…</span> : null}
          {n === page ? (
            <span aria-current="page" className="brand-gradient rounded-xl px-3.5 py-2 font-medium text-white">
              {n}
            </span>
          ) : (
            <Link href={href(n)} className="rounded-xl border border-line px-3.5 py-2 text-muted hover:text-fg">
              {n}
            </Link>
          )}
        </span>
      ))}
      {page < pageCount ? (
        <Link href={href(page + 1)} className="btn-secondary rounded-xl px-4 py-2" rel="next">
          Older →
        </Link>
      ) : null}
    </nav>
  );
}

export async function loadSidebar() {
  const [categories, tags, recent] = await Promise.all([
    getPublicCategories(),
    getPublicTags(),
    getPublicPosts("pageSize=5"),
  ]);
  return { categories: categories ?? [], tags: tags ?? [], recent: recent?.rows ?? [] };
}

export function BlogSidebar({
  categories,
  tags,
  recent,
}: {
  categories: PublicCategory[];
  tags: Array<{ id: string; name: string; slug: string; count: number }>;
  recent: PublicPostRow[];
}) {
  const shownTags = tags.filter((tag) => tag.count > 0).slice(0, 40);
  const maxCount = Math.max(1, ...shownTags.map((tag) => tag.count));

  return (
    <aside className="space-y-8 lg:sticky lg:top-24 lg:self-start">
      {categories.length ? (
        <SidebarBlock title="Categories">
          <CategoryTree categories={categories} />
        </SidebarBlock>
      ) : null}

      {shownTags.length ? (
        <SidebarBlock title="Tags">
          <ul className="flex flex-wrap gap-2">
            {shownTags.map((tag) => (
              <li key={tag.id}>
                <Link
                  href={`${BLOG_BASE}/tag/${tag.slug}`}
                  className="inline-block rounded-full border border-line px-2.5 py-1 text-muted hover:border-line-strong hover:text-fg"
                  // A tag cloud, tempered: the size ranges over one step, so
                  // the busiest tag reads as busiest without shouting.
                  style={{ fontSize: `${0.75 + 0.25 * (tag.count / maxCount)}rem` }}
                >
                  {tag.name}
                </Link>
              </li>
            ))}
          </ul>
        </SidebarBlock>
      ) : null}

      {recent.length ? (
        <SidebarBlock title="Recent posts">
          <ul className="space-y-3">
            {recent.map((post) => (
              <li key={post.id}>
                <Link href={post.path} className="block text-sm font-medium text-fg hover:text-accent-text">
                  {post.title}
                </Link>
                <span className="text-xs text-faint">{formatDate(post.publishedAt)}</span>
              </li>
            ))}
          </ul>
        </SidebarBlock>
      ) : null}
    </aside>
  );
}

function SidebarBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent-text">{title}</h2>
      {children}
    </section>
  );
}

function CategoryTree({ categories, depth = 0 }: { categories: PublicCategory[]; depth?: number }) {
  return (
    <ul className={depth ? "mt-1 space-y-1 border-l border-line pl-3" : "space-y-1.5"}>
      {categories.map((category) => (
        <li key={category.id}>
          <Link
            href={`${BLOG_BASE}/category/${category.slug}`}
            className="flex items-center justify-between gap-2 text-sm text-muted hover:text-fg"
          >
            <span>{category.name}</span>
            <span className="tabular-nums text-xs text-faint">{category.count}</span>
          </Link>
          {category.children?.length ? <CategoryTree categories={category.children} depth={depth + 1} /> : null}
        </li>
      ))}
    </ul>
  );
}

/** Plain links: no widgets, no third-party scripts on a public page. */
export function ShareLinks({ url, title }: { url: string; title: string }) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  const links = [
    { label: "X", href: `https://twitter.com/intent/tweet?url=${u}&text=${t}` },
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { label: "WhatsApp", href: `https://wa.me/?text=${t}%20${u}` },
    { label: "Email", href: `mailto:?subject=${t}&body=${u}` },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-faint">Share</span>
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-line px-3 py-1 text-muted hover:border-line-strong hover:text-fg"
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}

/** Finds a category by slug anywhere in the tree. */
export function findCategory(categories: PublicCategory[], slug: string): PublicCategory | null {
  for (const category of categories) {
    if (category.slug === slug) return category;
    const inner = category.children?.length ? findCategory(category.children, slug) : null;
    if (inner) return inner;
  }
  return null;
}

/** "3" → 3; anything else → null, so a mangled address is a 404 not a crash. */
export function parsePageNumber(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 ? n : null;
}
