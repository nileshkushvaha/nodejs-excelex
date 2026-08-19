import Link from "next/link";

import { STATUS_LABEL, STATUS_TONE, formatWhen, statusOf } from "@/components/cms/status";
import { StatusPill } from "@/components/status-pill";
import { getCmsContents, getCmsCounts, getCmsSettings, getCurrentSession } from "@/lib/api";
import { can } from "@/lib/can";

export const metadata = { title: "Content · ExcelEx" };

/**
 * The content overview: numbers by status, what was touched last, and the
 * doors into each area. Every fetch here is allowed to come back null — a
 * person who may edit posts but not pages still gets a useful page, with
 * the tiles they may not see simply absent.
 */
function StatCard({ label, value, hint, href }: { label: string; value: number; hint: string; href: string }) {
  return (
    <Link href={href} className="card card-interactive group relative block overflow-hidden rounded-xl p-4">
      <span aria-hidden="true" className="brand-gradient absolute inset-x-0 top-0 h-1 opacity-80 transition-opacity group-hover:opacity-100" />
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-fg">{value}</p>
      <p className="mt-0.5 text-xs text-faint">{hint}</p>
    </Link>
  );
}

export default async function ContentOverviewPage() {
  const [session, pageCounts, postCounts, recentPages, recentPosts, settings] = await Promise.all([
    getCurrentSession(),
    getCmsCounts("pages"),
    getCmsCounts("posts"),
    getCmsContents("pages", "pageSize=5&sort=updated"),
    getCmsContents("posts", "pageSize=5&sort=updated"),
    getCmsSettings(),
  ]);

  const seesPages = can(session, "cmsPage", "view");
  const seesPosts = can(session, "cmsPost", "view");

  if (!seesPages && !seesPosts) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">cms.page.view</code> or <code className="font-mono">cms.post.view</code>.
      </p>
    );
  }

  const recent = [...(recentPages?.rows ?? []), ...(recentPosts?.rows ?? [])]
    .filter((row) => statusOf(row) !== "TRASH")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 8);

  const links = [
    { href: "/content/pages", label: "Pages", show: seesPages, hint: "Standing pages, drafts and revisions" },
    { href: "/content/posts", label: "Posts", show: seesPosts, hint: "The blog" },
    { href: "/content/categories", label: "Categories", show: seesPosts, hint: "How posts are grouped" },
    { href: "/content/tags", label: "Tags", show: seesPosts, hint: "Free-form labels" },
    { href: "/content/media", label: "Media", show: can(session, "cmsMedia", "view"), hint: "Images and files" },
    { href: "/content/menus", label: "Menus", show: seesPages, hint: "Header and footer navigation" },
    { href: "/content/settings", label: "Site settings", show: seesPages, hint: "Title, home page, blog, SEO defaults" },
  ].filter((link) => link.show);

  return (
    <div className="animate-fade-up">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Content</h1>
        <p className="mt-0.5 text-sm text-muted">
          {settings?.siteTitle ? (
            <>
              The public site — <span className="text-fg">{settings.siteTitle}</span> — and everything on it.
            </>
          ) : (
            "The public site and everything on it."
          )}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {pageCounts ? (
          <>
            <StatCard label="Published pages" value={pageCounts.PUBLISHED} hint={`${pageCounts.all} in all`} href="/content/pages?status=PUBLISHED" />
            <StatCard label="Page drafts" value={pageCounts.DRAFT} hint={pageCounts.SCHEDULED ? `${pageCounts.SCHEDULED} scheduled` : "Nothing scheduled"} href="/content/pages?status=DRAFT" />
          </>
        ) : null}
        {postCounts ? (
          <>
            <StatCard label="Published posts" value={postCounts.PUBLISHED} hint={`${postCounts.all} in all`} href="/content/posts?status=PUBLISHED" />
            <StatCard label="Post drafts" value={postCounts.DRAFT} hint={postCounts.SCHEDULED ? `${postCounts.SCHEDULED} scheduled` : "Nothing scheduled"} href="/content/posts?status=DRAFT" />
          </>
        ) : null}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="card rounded-xl">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="text-sm font-semibold text-fg">Recently edited</h2>
            <span className="flex gap-3 text-xs">
              {seesPages && can(session, "cmsPage", "update") ? (
                <Link href="/content/pages/new" className="text-accent-text hover:underline">
                  New page
                </Link>
              ) : null}
              {seesPosts && can(session, "cmsPost", "update") ? (
                <Link href="/content/posts/new" className="text-accent-text hover:underline">
                  New post
                </Link>
              ) : null}
            </span>
          </div>
          {recent.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">Nothing written yet.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {recent.map((row) => {
                const collection = row.kind === "PAGE" ? "pages" : "posts";
                return (
                  <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-sm">
                    <Link href={`/content/${collection}/${row.id}`} className="font-medium text-fg hover:text-accent-text hover:underline">
                      {row.title || "(untitled)"}
                    </Link>
                    <span className="text-[11px] uppercase text-faint">{row.kind.toLowerCase()}</span>
                    <StatusPill tone={STATUS_TONE[statusOf(row)]}>{STATUS_LABEL[statusOf(row)]}</StatusPill>
                    <span className="ml-auto text-xs tabular-nums text-muted">{formatWhen(row.updatedAt)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="card rounded-xl">
          <div className="border-b border-line px-5 py-3">
            <h2 className="text-sm font-semibold text-fg">Go to</h2>
          </div>
          <ul className="divide-y divide-line-soft">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="block px-5 py-2.5 hover:bg-surface-2">
                  <span className="block text-sm text-fg">{link.label}</span>
                  <span className="block text-xs text-faint">{link.hint}</span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
