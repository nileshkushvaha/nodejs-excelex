import { ContentList } from "@/components/cms/content-list";
import { getCmsContents, getCmsCounts, getCmsTerms, getCurrentSession, getUsers } from "@/lib/api";
import { can, hasPermission } from "@/lib/can";
import * as actions from "./actions";

export const metadata = { title: "Pages · ExcelEx" };

export default async function PagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const single = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const query = new URLSearchParams();
  for (const key of ["page", "pageSize", "status", "search", "authorId", "termId", "parentId", "sort"]) {
    const value = single(key);
    if (value) query.set(key, value);
  }

  const [page, counts, session, users, categories] = await Promise.all([
    getCmsContents("pages", query.toString()),
    getCmsCounts("pages"),
    getCurrentSession(),
    getUsers(),
    Promise.resolve(null),
  ]);

  if (!page) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">cms.page.view</code>.
      </p>
    );
  }

  return (
    <div className="animate-fade-up">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Pages</h1>
        <p className="mt-0.5 text-sm text-muted">The site's standing pages — about, services, contact — with drafts, scheduling and revisions.</p>
      </header>

      <ContentList
        collection="pages"
        page={page}
        counts={counts}
        authors={(users ?? []).map((user) => ({ id: user.id, fullName: user.fullName }))}
        categories={categories ?? []}
        canManage={can(session, "cmsPage", "update")}
        canPublish={hasPermission(session, "cms.page.publish")}
        actions={{
          publish: actions.publish,
          unpublish: actions.unpublish,
          archive: actions.archive,
          restore: actions.restore,
          duplicate: actions.duplicate,
          trash: actions.trash,
          destroy: actions.destroy,
          bulk: actions.bulk,
        }}
      />
    </div>
  );
}
