import { Injectable } from "@nestjs/common";
import type { Prisma } from "@excelex/database";

import { CacheService } from "../../core/cache/cache.service";
import { requireRequestContext } from "../../core/context/request-context";
import { PrismaService } from "../../core/database/prisma.service";
import { NotFoundError } from "../../core/errors/app-error";
import { paginate } from "../../masters/paged";
import { ContentService, type MediaRef } from "../content/content.service";
import { excerptOf } from "../html-sanitizer";
import { buildMenuTree, loadMenuLookups } from "../menus/menus.service";
import { loadTermNodes } from "../terms/terms.service";
import {
  cacheKeyFor,
  categoryArchivePath,
  loadBlogPath,
  loadPageNodes,
  loadPeople,
  normaliseBlogPath,
  pagePath,
  postPath,
  readingMinutes,
  tagArchivePath,
  termPath,
  type ClientTx,
  type CmsContent,
  type CmsTerm,
  type PathNode,
} from "../shared";

/**
 * What the client's public site reads, and nothing else.
 *
 * Every method here answers for exactly one client — the one the host
 * resolved to — and sees only what is PUBLISHED and not in the bin, with one
 * exception: a preview token, minted by an editor for one item, lets that
 * item through whatever its status, and that read is never cached. Everything
 * else is cached for five minutes under the client's `cms` namespace, keyed
 * by route and query, and the admin side clears the namespace whenever it
 * changes something a visitor could see.
 *
 * A path that matches nothing is looked up in the redirects before it is a
 * 404, and the answer is a 200 carrying `redirect` — the web app performs the
 * redirect with the right status, because it is the one holding the
 * visitor's response. That lookup sits outside the cache on purpose: the
 * hit counter is the only reason the row exists.
 */
const TTL = 300;
const CONTENT_INCLUDE = { terms: { include: { term: true } } } as const;

type PublicContent = CmsContent & { terms: Array<{ term: CmsTerm }> };

interface Lookups {
  pages: Map<string, PathNode>;
  categories: Map<string, PathNode>;
  blogPath: string;
  people: Map<string, { id: string; fullName: string }>;
  media: Map<string, MediaRef>;
}

@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly content: ContentService,
  ) {}

  private clientId(): string {
    const { clientId } = requireRequestContext();
    if (!clientId) throw new NotFoundError("This site");
    return clientId;
  }

  private cached<T>(clientId: string, key: string, loader: () => Promise<T>): Promise<T> {
    return this.cache.getOrSet({ clientId }, "cms", key, loader, TTL);
  }

  // ── Site ─────────────────────────────────────────────────────────────────

  site() {
    const clientId = this.clientId();
    return this.cached(clientId, "site", () =>
      this.prisma.forClient(clientId, async (tx) => {
        const settings = await tx.cmsSiteSettings.findFirst();
        const menus = await tx.cmsMenu.findMany({ include: { items: true } });
        const lookups = await loadMenuLookups(tx);
        const menuFor = (location: string) => {
          const menu = menus.find((row) => row.location === location);
          return menu ? buildMenuTree(menu.items, lookups, { publicOnly: true }) : null;
        };
        const homePage = settings?.homePageId
          ? await tx.cmsContent.findFirst({ where: { id: settings.homePageId, kind: "PAGE", status: "PUBLISHED", deletedAt: null }, select: { slug: true } })
          : null;
        const og = settings?.defaultOgImageMediaId ? (await this.content.loadMedia(tx, [settings.defaultOgImageMediaId])).get(settings.defaultOgImageMediaId) : undefined;
        return {
          title: settings?.siteTitle ?? null,
          tagline: settings?.tagline ?? null,
          blogPath: normaliseBlogPath(settings?.blogPath),
          postsPerPage: settings?.postsPerPage ?? 10,
          footerText: settings?.footerText ?? null,
          socialLinks: (Array.isArray(settings?.socialLinks) ? settings.socialLinks : []) as Array<{ label: string; url: string }>,
          indexable: settings?.indexable ?? true,
          menus: { header: menuFor("header"), footer: menuFor("footer") },
          defaultMetaDescription: settings?.defaultMetaDescription ?? null,
          defaultOgImageUrl: og?.url ?? null,
          homePage: homePage ? { slug: homePage.slug } : null,
        };
      }),
    );
  }

  // ── Pages ────────────────────────────────────────────────────────────────

  async page(rawPath: string, preview?: string) {
    const clientId = this.clientId();
    const path = "/" + rawPath.split("/").filter(Boolean).join("/");

    if (preview) {
      const target = await this.content.resolvePreview(clientId, preview);
      if (target?.kind === "PAGE") {
        return this.prisma.forClient(clientId, async (tx) => {
          const row = await tx.cmsContent.findFirst({ where: { id: target.contentId, kind: "PAGE", deletedAt: null }, include: CONTENT_INCLUDE });
          if (!row) throw new NotFoundError("That page");
          return this.serialisePage(tx, row, await this.lookups(tx, [row]));
        });
      }
    }

    const found = await this.cached(clientId, cacheKeyFor("page", path), () =>
      this.prisma.forClient(clientId, async (tx) => {
        const nodes = await loadPageNodes(tx);
        const slug = path.split("/").pop() ?? "";
        const candidates = await tx.cmsContent.findMany({ where: { kind: "PAGE", slug, status: "PUBLISHED", deletedAt: null }, include: CONTENT_INCLUDE });
        const row = candidates.find((candidate) => pagePath(candidate.id, nodes) === path);
        if (!row) return null;
        return this.serialisePage(tx, row, await this.lookups(tx, [row]));
      }),
    );
    if (found) return found;

    const redirect = await this.prisma.forClient(clientId, async (tx) => {
      const row = await tx.cmsRedirect.findFirst({ where: { fromPath: path } });
      if (!row) return null;
      await tx.cmsRedirect.update({ where: { id: row.id }, data: { hits: { increment: 1 } } });
      return { to: row.toPath, statusCode: row.statusCode };
    });
    if (redirect) return { redirect };
    throw new NotFoundError("That page");
  }

  private async serialisePage(tx: ClientTx, row: PublicContent, lookups: Lookups) {
    const path = pagePath(row.id, lookups.pages);
    const chain: Array<{ title: string; path: string }> = [];
    let current: PathNode | undefined = row.parentId ? lookups.pages.get(row.parentId) : undefined;
    const ancestorIds: string[] = [];
    while (current && !ancestorIds.includes(current.id)) {
      ancestorIds.unshift(current.id);
      current = current.parentId ? lookups.pages.get(current.parentId) : undefined;
    }
    const [ancestors, children] = await Promise.all([
      ancestorIds.length ? tx.cmsContent.findMany({ where: { id: { in: ancestorIds }, status: "PUBLISHED", deletedAt: null }, select: { id: true, title: true } }) : [],
      tx.cmsContent.findMany({ where: { parentId: row.id, kind: "PAGE", status: "PUBLISHED", deletedAt: null }, orderBy: [{ menuOrder: "asc" }, { title: "asc" }], select: { id: true, title: true } }),
    ]);
    const titles = new Map(ancestors.map((page) => [page.id, page.title]));
    for (const id of ancestorIds) {
      const title = titles.get(id);
      if (title) chain.push({ title, path: pagePath(id, lookups.pages) });
    }
    return {
      ...this.serialiseCommon(row, path, lookups),
      breadcrumbs: [...chain, { title: row.title, path }],
      children: children.map((child) => ({ title: child.title, path: pagePath(child.id, lookups.pages) })),
    };
  }

  // ── Posts ────────────────────────────────────────────────────────────────

  posts(query: { page?: string; pageSize?: string; category?: string; tag?: string; search?: string; author?: string }) {
    const clientId = this.clientId();
    const key = cacheKeyFor("posts", query.page, query.pageSize, query.category, query.tag, query.search, query.author);
    return this.cached(clientId, key, () =>
      this.prisma.forClient(clientId, async (tx) => {
        const settings = await tx.cmsSiteSettings.findFirst({ select: { postsPerPage: true } });
        const where: Prisma.CmsContentWhereInput = {
          kind: "POST",
          status: "PUBLISHED",
          deletedAt: null,
          ...(query.category ? { terms: { some: { term: { taxonomy: "CATEGORY", slug: query.category } } } } : {}),
          ...(query.tag ? { terms: { some: { term: { taxonomy: "TAG", slug: query.tag } } } } : {}),
          ...(query.author && /^[0-9a-f-]{36}$/iu.test(query.author) ? { authorId: query.author } : {}),
          ...(query.search
            ? { OR: [{ title: { contains: query.search, mode: "insensitive" } }, { plainText: { contains: query.search, mode: "insensitive" } }] }
            : {}),
        };
        const page = await paginate<PublicContent, PublicContent>(
          tx.cmsContent,
          {
            where,
            include: CONTENT_INCLUDE,
            orderBy: [{ isSticky: "desc" }, { publishedAt: "desc" }],
            request: {
              page: Number(query.page ?? 1) || 1,
              pageSize: Number(query.pageSize ?? settings?.postsPerPage ?? 10) || 10,
            },
          },
          (row) => row,
        );
        const lookups = await this.lookups(tx, page.rows);
        return { ...page, rows: page.rows.map((row) => this.serialisePostCard(row, lookups)) };
      }),
    );
  }

  async post(slug: string, preview?: string) {
    const clientId = this.clientId();
    if (preview) {
      const target = await this.content.resolvePreview(clientId, preview);
      if (target?.kind === "POST") {
        return this.prisma.forClient(clientId, async (tx) => {
          const row = await tx.cmsContent.findFirst({ where: { id: target.contentId, kind: "POST", deletedAt: null }, include: CONTENT_INCLUDE });
          if (!row) throw new NotFoundError("That post");
          return this.serialisePost(tx, row, await this.lookups(tx, [row]));
        });
      }
    }
    const found = await this.cached(clientId, cacheKeyFor("post", slug), () =>
      this.prisma.forClient(clientId, async (tx) => {
        const row = await tx.cmsContent.findFirst({ where: { kind: "POST", slug, status: "PUBLISHED", deletedAt: null }, include: CONTENT_INCLUDE });
        if (!row) return null;
        return this.serialisePost(tx, row, await this.lookups(tx, [row]));
      }),
    );
    if (found) return found;
    throw new NotFoundError("That post");
  }

  private async serialisePost(tx: ClientTx, row: PublicContent, lookups: Lookups) {
    const at = row.publishedAt ?? row.updatedAt;
    const live = { kind: "POST" as const, status: "PUBLISHED" as const, deletedAt: null, id: { not: row.id } };
    const [previous, next] = await Promise.all([
      tx.cmsContent.findFirst({ where: { ...live, publishedAt: { lt: at } }, orderBy: { publishedAt: "desc" }, select: { title: true, slug: true } }),
      tx.cmsContent.findFirst({ where: { ...live, publishedAt: { gt: at } }, orderBy: { publishedAt: "asc" }, select: { title: true, slug: true } }),
    ]);
    return {
      ...this.serialisePostCard(row, lookups),
      ...this.serialiseCommon(row, postPath(lookups.blogPath, row.slug), lookups),
      previous: previous ? { title: previous.title, path: postPath(lookups.blogPath, previous.slug) } : null,
      next: next ? { title: next.title, path: postPath(lookups.blogPath, next.slug) } : null,
    };
  }

  private serialisePostCard(row: PublicContent, lookups: Lookups) {
    const featured = row.featuredMediaId ? lookups.media.get(row.featuredMediaId) : undefined;
    const author = row.authorId ? lookups.people.get(row.authorId) : undefined;
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      path: postPath(lookups.blogPath, row.slug),
      excerpt: row.excerpt || excerptOf(row.plainText),
      featuredImage: featured ? { url: featured.url, alt: featured.altText, width: featured.width, height: featured.height } : null,
      author: author ? { fullName: author.fullName } : null,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      readingMinutes: readingMinutes(row.plainText),
      categories: row.terms
        .filter((link) => link.term.taxonomy === "CATEGORY")
        .map((link) => ({ name: link.term.name, slug: link.term.slug, path: categoryArchivePath(lookups.blogPath, link.term.slug) })),
      tags: row.terms.filter((link) => link.term.taxonomy === "TAG").map((link) => ({ name: link.term.name, slug: link.term.slug })),
      isSticky: row.isSticky,
    };
  }

  private serialiseCommon(row: PublicContent, path: string, lookups: Lookups) {
    const featured = row.featuredMediaId ? lookups.media.get(row.featuredMediaId) : undefined;
    const og = row.ogImageMediaId ? lookups.media.get(row.ogImageMediaId) : undefined;
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      path,
      template: row.template,
      body: row.body,
      excerpt: row.excerpt || excerptOf(row.plainText),
      featuredImage: featured ? { url: featured.url, alt: featured.altText, width: featured.width, height: featured.height } : null,
      seo: {
        title: row.metaTitle ?? row.title,
        description: row.metaDescription ?? row.excerpt ?? excerptOf(row.plainText, 30),
        canonical: row.canonicalUrl,
        noIndex: row.noIndex,
        ogImageUrl: og?.url ?? featured?.url ?? null,
      },
      publishedAt: row.publishedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // ── Taxonomies ───────────────────────────────────────────────────────────

  categories() {
    const clientId = this.clientId();
    return this.cached(clientId, "categories", () =>
      this.prisma.forClient(clientId, async (tx) => {
        const rows = await tx.cmsTerm.findMany({ where: { taxonomy: "CATEGORY" }, orderBy: { name: "asc" } });
        const nodes = new Map<string, PathNode>(rows.map((row) => [row.id, row]));
        const blogPath = await loadBlogPath(tx);
        const byParent = new Map<string | null, CmsTerm[]>();
        for (const row of rows) byParent.set(row.parentId, [...(byParent.get(row.parentId) ?? []), row]);
        const build = (parentId: string | null): unknown[] =>
          (byParent.get(parentId) ?? []).map((row) => ({
            id: row.id,
            name: row.name,
            slug: row.slug,
            description: row.description,
            path: categoryArchivePath(blogPath, row.slug),
            fullSlug: termPath(row.id, nodes),
            count: row.count,
            children: build(row.id),
          }));
        return build(null);
      }),
    );
  }

  tags() {
    const clientId = this.clientId();
    return this.cached(clientId, "tags", () =>
      this.prisma.forClient(clientId, async (tx) => {
        const blogPath = await loadBlogPath(tx);
        const rows = await tx.cmsTerm.findMany({ where: { taxonomy: "TAG" }, orderBy: { name: "asc" } });
        return rows.map((row) => ({ id: row.id, name: row.name, slug: row.slug, description: row.description, path: tagArchivePath(blogPath, row.slug), count: row.count }));
      }),
    );
  }

  // ── Sitemap and feed ─────────────────────────────────────────────────────

  sitemap() {
    const clientId = this.clientId();
    return this.cached(clientId, "sitemap", () =>
      this.prisma.forClient(clientId, async (tx) => {
        const [contents, terms, nodes, blogPath] = await Promise.all([
          tx.cmsContent.findMany({ where: { status: "PUBLISHED", deletedAt: null }, select: { id: true, kind: true, slug: true, updatedAt: true, noIndex: true } }),
          tx.cmsTerm.findMany({ where: { count: { gt: 0 } }, select: { id: true, taxonomy: true, slug: true, updatedAt: true } }),
          loadPageNodes(tx),
          loadBlogPath(tx),
        ]);
        const urls = [
          ...contents
            .filter((row) => !row.noIndex)
            .map((row) => ({
              path: row.kind === "PAGE" ? pagePath(row.id, nodes) : postPath(blogPath, row.slug),
              updatedAt: row.updatedAt.toISOString(),
              kind: row.kind === "PAGE" ? "page" : "post",
            })),
          ...terms.map((row) => ({
            path: row.taxonomy === "CATEGORY" ? categoryArchivePath(blogPath, row.slug) : tagArchivePath(blogPath, row.slug),
            updatedAt: row.updatedAt.toISOString(),
            kind: row.taxonomy === "CATEGORY" ? "category" : "tag",
          })),
        ];
        return { urls };
      }),
    );
  }

  feed() {
    const clientId = this.clientId();
    return this.cached(clientId, "feed", () =>
      this.prisma.forClient(clientId, async (tx) => {
        const [settings, rows] = await Promise.all([
          tx.cmsSiteSettings.findFirst({ select: { siteTitle: true, blogPath: true } }),
          tx.cmsContent.findMany({ where: { kind: "POST", status: "PUBLISHED", deletedAt: null }, orderBy: { publishedAt: "desc" }, take: 20 }),
        ]);
        const blogPath = normaliseBlogPath(settings?.blogPath);
        const people = await loadPeople(tx, rows.map((row) => row.authorId));
        return {
          title: settings?.siteTitle ?? null,
          link: blogPath,
          items: rows.map((row) => ({
            title: row.title,
            path: postPath(blogPath, row.slug),
            excerpt: row.excerpt || excerptOf(row.plainText),
            publishedAt: row.publishedAt?.toISOString() ?? null,
            author: row.authorId ? (people.get(row.authorId)?.fullName ?? null) : null,
          })),
        };
      }),
    );
  }

  // ── Lookups ──────────────────────────────────────────────────────────────

  private async lookups(tx: ClientTx, rows: PublicContent[]): Promise<Lookups> {
    const [pages, categories, blogPath, people, media] = await Promise.all([
      loadPageNodes(tx),
      loadTermNodes(tx),
      loadBlogPath(tx),
      loadPeople(tx, rows.map((row) => row.authorId)),
      this.content.loadMedia(tx, rows.flatMap((row) => [row.featuredMediaId, row.ogImageMediaId])),
    ]);
    return { pages, categories, blogPath, people, media };
  }
}
