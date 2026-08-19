import {
  getCmsContent,
  getCmsContents,
  getCmsSettings,
  getCmsTerms,
  getCurrentSession,
  type CmsContentDetail,
  type CmsContentPage,
} from "@/lib/api";
import { can, hasPermission } from "@/lib/can";

/**
 * Everything the posts editor needs, gathered in one place so the "new" and
 * "edit" routes render the same component from the same inputs. The parent
 * list and the term list are best-effort: a person who may edit posts but not
 * read settings still gets an editor, just with the defaults.
 */
export async function loadEditor(id: string | null) {
  const [content, session, settings, siblings, categories] = await Promise.all([
    id ? getCmsContent("posts", id) : Promise.resolve(null),
    getCurrentSession(),
    getCmsSettings(),
    Promise.resolve(null as CmsContentPage | null),
    getCmsTerms("taxonomy=CATEGORY"),
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
    canManage: can(session, "cmsPost", "update"),
    canPublish: hasPermission(session, "cms.post.publish"),
    canCreateTerms: can(session, "cmsTerm", "create"),
  };
}

export const viewPermission = "cms.post.view";
