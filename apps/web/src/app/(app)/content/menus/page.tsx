import { MenuTreeEditor } from "@/components/cms/menu-tree-editor";
import { getCmsContents, getCmsMenus, getCmsTerms, getCurrentSession } from "@/lib/api";
import { can } from "@/lib/can";

export const metadata = { title: "Menus · ExcelEx" };

/**
 * The pickers offer published pages and posts and every category: a menu
 * that points at a draft would 404 on the public site. Fetches for the
 * pickers are best-effort — a menu can still be edited with custom URLs
 * when the person may not list posts.
 */
export default async function MenusPage() {
  const [menus, session, pages, posts, categories] = await Promise.all([
    getCmsMenus(),
    getCurrentSession(),
    getCmsContents("pages", "status=PUBLISHED&pageSize=100&sort=title"),
    getCmsContents("posts", "status=PUBLISHED&pageSize=100&sort=published"),
    getCmsTerms("taxonomy=CATEGORY"),
  ]);

  if (!menus) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">cms.page.view</code>.
      </p>
    );
  }

  const pick = (rows: Array<{ id: string; title: string; path: string }> | undefined) =>
    (rows ?? []).map((row) => ({ id: row.id, label: row.title, path: row.path }));

  return (
    <div className="animate-fade-up">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Menus</h1>
        <p className="mt-0.5 text-sm text-muted">
          The public site&apos;s navigation. The header menu sits across the top of every page; the footer menu
          under it. Each entry points at a page, a post, a category or any address.
        </p>
      </header>

      <MenuTreeEditor
        menus={menus}
        pages={pick(pages?.rows)}
        posts={pick(posts?.rows)}
        categories={(categories ?? []).map((term) => ({ id: term.id, label: term.name, path: `/blog/category/${term.path || term.slug}` }))}
        canManage={can(session, "cmsMenu", "update")}
      />
    </div>
  );
}
