import { Injectable } from "@nestjs/common";

import { CacheService } from "../../core/cache/cache.service";
import { requireRequestContext } from "../../core/context/request-context";
import { PrismaService } from "../../core/database/prisma.service";
import { NotFoundError } from "../../core/errors/app-error";
import { loadTermNodes } from "../terms/terms.service";
import { audit, categoryArchivePath, loadBlogPath, loadPageNodes, pagePath, postPath, tagArchivePath, termPath, type ClientTx, type CmsMenuItem } from "../shared";

/**
 * Menus: a named tree per location, replaced whole.
 *
 * A menu is edited as one thing — drag, indent, save — so the write is one
 * thing too: delete the items, insert the tree, in one transaction. Item ids
 * therefore change on every save, which is fine because nothing references
 * an item; the location is the stable handle. Each item's URL is resolved
 * at read time from whatever it points at, so renaming a page renames the
 * link, and a page that leaves the site leaves the public menu (the admin
 * view keeps it, marked, so it can be fixed).
 */
export interface MenuItemInput {
  label: string;
  description?: string | null;
  contentId?: string | null;
  termId?: string | null;
  url?: string | null;
  openInNewTab?: boolean;
  children?: MenuItemInput[];
}

export interface MenuItemNode {
  id: string;
  label: string;
  description: string | null;
  url: string | null;
  target: { contentId?: string; termId?: string; url?: string };
  openInNewTab: boolean;
  position: number;
  /** Admin only: whether the linked page or post is live on the site. */
  published?: boolean;
  children: MenuItemNode[];
}

const LOCATION_PATTERN = /^[a-z][a-z0-9-]{0,40}$/u;

@Injectable()
export class MenusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async list() {
    const { clientId } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => {
      const menus = await tx.cmsMenu.findMany({ include: { items: true }, orderBy: { location: "asc" } });
      const lookups = await loadMenuLookups(tx);
      return menus.map((menu) => ({
        id: menu.id,
        name: menu.name,
        location: menu.location,
        items: buildMenuTree(menu.items, lookups, { publicOnly: false }),
      }));
    });
  }

  async replace(location: string, input: { name: string; items: MenuItemInput[] }) {
    const { clientId } = requireRequestContext();
    if (!LOCATION_PATTERN.test(location)) throw new NotFoundError("That menu location");
    return this.prisma.forClient(clientId!, async (tx) => {
      const menu = await tx.cmsMenu.upsert({
        where: { clientId_location: { clientId: clientId!, location } },
        create: { clientId: clientId!, location, name: input.name },
        update: { name: input.name },
      });
      await tx.cmsMenuItem.deleteMany({ where: { menuId: menu.id } });
      let count = 0;
      const insert = async (items: MenuItemInput[], parentId: string | null): Promise<void> => {
        for (const [position, item] of items.entries()) {
          const row = await tx.cmsMenuItem.create({
            data: {
              clientId: clientId!,
              menuId: menu.id,
              parentId,
              position,
              label: item.label,
              description: item.description ?? null,
              contentId: item.contentId ?? null,
              termId: item.contentId ? null : (item.termId ?? null),
              url: item.contentId || item.termId ? null : (item.url ?? null),
              openInNewTab: item.openInNewTab ?? false,
            },
          });
          count += 1;
          if (item.children?.length) await insert(item.children, row.id);
        }
      };
      await insert(input.items, null);
      await audit(tx, { clientId: clientId!, action: "cms.menu.updated", entity: "cms_menu", entityId: menu.id, metadata: { location, name: input.name, items: count } });
      await this.cache.invalidateNamespace({ clientId: clientId! }, "cms");

      const saved = await tx.cmsMenu.findFirstOrThrow({ where: { id: menu.id }, include: { items: true } });
      return { id: saved.id, name: saved.name, location: saved.location, items: buildMenuTree(saved.items, await loadMenuLookups(tx), { publicOnly: false }) };
    });
  }

  async remove(location: string): Promise<void> {
    const { clientId } = requireRequestContext();
    await this.prisma.forClient(clientId!, async (tx) => {
      const menu = await tx.cmsMenu.findFirst({ where: { location } });
      if (!menu) throw new NotFoundError("That menu");
      await tx.cmsMenu.delete({ where: { id: menu.id } });
      await audit(tx, { clientId: clientId!, action: "cms.menu.deleted", entity: "cms_menu", entityId: menu.id, metadata: { location, name: menu.name } });
      await this.cache.invalidateNamespace({ clientId: clientId! }, "cms");
    });
  }
}

// ── Resolution, shared with the public read ──────────────────────────────────

export interface MenuLookups {
  pages: Map<string, { id: string; slug: string; parentId: string | null }>;
  contents: Map<string, { kind: "PAGE" | "POST"; slug: string; published: boolean }>;
  categories: Map<string, { id: string; slug: string; parentId: string | null }>;
  terms: Map<string, { taxonomy: "CATEGORY" | "TAG"; slug: string }>;
  blogPath: string;
}

export async function loadMenuLookups(tx: ClientTx): Promise<MenuLookups> {
  const [pages, contents, categories, terms, blogPath] = await Promise.all([
    loadPageNodes(tx),
    tx.cmsContent.findMany({ select: { id: true, kind: true, slug: true, status: true, deletedAt: true } }),
    loadTermNodes(tx),
    tx.cmsTerm.findMany({ select: { id: true, taxonomy: true, slug: true } }),
    loadBlogPath(tx),
  ]);
  return {
    pages,
    contents: new Map(contents.map((row) => [row.id, { kind: row.kind, slug: row.slug, published: row.status === "PUBLISHED" && !row.deletedAt }])),
    categories,
    terms: new Map(terms.map((row) => [row.id, { taxonomy: row.taxonomy, slug: row.slug }])),
    blogPath,
  };
}

export function resolveMenuUrl(item: Pick<CmsMenuItem, "contentId" | "termId" | "url">, lookups: MenuLookups): { url: string | null; published: boolean } {
  if (item.contentId) {
    const content = lookups.contents.get(item.contentId);
    if (!content) return { url: null, published: false };
    const url = content.kind === "PAGE" ? pagePath(item.contentId, lookups.pages) : postPath(lookups.blogPath, content.slug);
    return { url, published: content.published };
  }
  if (item.termId) {
    const term = lookups.terms.get(item.termId);
    if (!term) return { url: null, published: false };
    const url = term.taxonomy === "CATEGORY" ? categoryArchivePath(lookups.blogPath, termPath(item.termId, lookups.categories)) : tagArchivePath(lookups.blogPath, term.slug);
    return { url, published: true };
  }
  return { url: item.url ?? null, published: true };
}

export function buildMenuTree(items: CmsMenuItem[], lookups: MenuLookups, options: { publicOnly: boolean }): MenuItemNode[] {
  const byParent = new Map<string | null, CmsMenuItem[]>();
  for (const item of items) {
    const list = byParent.get(item.parentId) ?? [];
    list.push(item);
    byParent.set(item.parentId, list);
  }
  const build = (parentId: string | null): MenuItemNode[] =>
    (byParent.get(parentId) ?? [])
      .sort((a, b) => a.position - b.position)
      .flatMap((item) => {
        const { url, published } = resolveMenuUrl(item, lookups);
        if (options.publicOnly && (!published || url === null)) return [];
        const node: MenuItemNode = {
          id: item.id,
          label: item.label,
          description: item.description,
          url,
          target: item.contentId ? { contentId: item.contentId } : item.termId ? { termId: item.termId } : { url: item.url ?? "" },
          openInNewTab: item.openInNewTab,
          position: item.position,
          ...(options.publicOnly ? {} : { published }),
          children: build(item.id),
        };
        return [node];
      });
  return build(null);
}
