import {
  getCmsContent,
  getCmsContents,
  getCmsSettings,
  getCmsTerms,
  getCurrentSession,
  type CmsContentDetail,
  type CmsTerm,
} from "@/lib/api";
import { can, hasPermission } from "@/lib/can";

/**
 * Everything the pages editor needs, gathered in one place so the "new" and
 * "edit" routes render the same component from the same inputs. The parent
 * list and the term list are best-effort: a person who may edit pages but not
 * read settings still gets an editor, just with the defaults.
 */
export async function loadEditor(id: string | null) {
  const [content, session, settings, siblings, categories] = await Promise.all([
    id ? getCmsContent("pages", id) : Promise.resolve(null),
    getCurrentSession(),
    getCmsSettings(),
    getCmsContents("pages", "pageSize=100&sort=title"),
    Promise.resolve(null as CmsTerm[] | null),
  ]);

  return {
    content: content as CmsContentDetail | null,
    session,
    siteTitle: settings?.siteTitle,
    blogPath: settings?.blogPath ?? "/blog",
    parents: (siblings?.rows ?? [])
      .filter((row) => row.id !== id && !row.deletedAt)
      .map((row) => ({ id: row.id, title: row.title, path: row.path })),
    categories: categories ?? [],
    canManage: can(session, "cmsPage", "update"),
    canPublish: hasPermission(session, "cms.page.publish"),
    canCreateTerms: can(session, "cmsTerm", "create"),
  };
}

export const viewPermission = "cms.page.view";
