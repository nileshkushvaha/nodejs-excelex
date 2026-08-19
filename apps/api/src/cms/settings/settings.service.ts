import { Injectable } from "@nestjs/common";

import { CacheService } from "../../core/cache/cache.service";
import { requireRequestContext } from "../../core/context/request-context";
import { PrismaService } from "../../core/database/prisma.service";
import { NotFoundError } from "../../core/errors/app-error";
import { StorageService } from "../../core/storage/storage.service";
import { actorId, audit, normaliseBlogPath, type ClientTx, type CmsSiteSettings } from "../shared";

/**
 * The site as a whole: one row per client, made on first save.
 *
 * Read before anything is saved returns the defaults with `updatedAt` null,
 * so the settings screen and the public site have one shape to code against
 * whether or not anyone has been here. The blog path is normalised to one
 * leading slash and no trailing one, because every post path is built from
 * it and "/blog/" would put a double slash in every link on the site.
 */
export interface SettingsInput {
  siteTitle?: string | null;
  tagline?: string | null;
  homePageId?: string | null;
  blogPath?: string;
  postsPerPage?: number;
  footerText?: string | null;
  socialLinks?: Array<{ label: string; url: string }>;
  defaultMetaDescription?: string | null;
  defaultOgImageMediaId?: string | null;
  indexable?: boolean;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly storage: StorageService,
  ) {}

  async read() {
    const { clientId } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => this.serialise(tx, await tx.cmsSiteSettings.findFirst()));
  }

  async write(input: SettingsInput) {
    const { clientId } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => {
      const existing = await tx.cmsSiteSettings.findFirst();
      if (input.homePageId) {
        const page = await tx.cmsContent.findFirst({ where: { id: input.homePageId, kind: "PAGE", deletedAt: null }, select: { id: true } });
        if (!page) throw new NotFoundError("That home page");
      }
      const data = {
        siteTitle: input.siteTitle !== undefined ? input.siteTitle : (existing?.siteTitle ?? null),
        tagline: input.tagline !== undefined ? input.tagline : (existing?.tagline ?? null),
        homePageId: input.homePageId !== undefined ? input.homePageId : (existing?.homePageId ?? null),
        blogPath: input.blogPath !== undefined ? normaliseBlogPath(input.blogPath) : (existing?.blogPath ?? "/blog"),
        postsPerPage: input.postsPerPage ?? existing?.postsPerPage ?? 10,
        footerText: input.footerText !== undefined ? input.footerText : (existing?.footerText ?? null),
        socialLinks: (input.socialLinks ?? existing?.socialLinks ?? []) as never,
        defaultMetaDescription: input.defaultMetaDescription !== undefined ? input.defaultMetaDescription : (existing?.defaultMetaDescription ?? null),
        defaultOgImageMediaId: input.defaultOgImageMediaId !== undefined ? input.defaultOgImageMediaId : (existing?.defaultOgImageMediaId ?? null),
        indexable: input.indexable ?? existing?.indexable ?? true,
        updatedById: actorId(),
      };
      const row = existing
        ? await tx.cmsSiteSettings.update({ where: { id: existing.id }, data })
        : await tx.cmsSiteSettings.create({ data: { clientId: clientId!, ...data } });
      await audit(tx, { clientId: clientId!, action: "cms.settings.updated", entity: "cms_site_settings", entityId: row.id, metadata: { changed: Object.keys(input) } });
      await this.cache.invalidateNamespace({ clientId: clientId! }, "cms");
      return this.serialise(tx, row);
    });
  }

  private async serialise(tx: ClientTx, row: CmsSiteSettings | null) {
    const [homePage, ogImage] = await Promise.all([
      row?.homePageId ? tx.cmsContent.findFirst({ where: { id: row.homePageId, deletedAt: null }, select: { id: true, title: true, slug: true } }) : null,
      row?.defaultOgImageMediaId ? tx.cmsMedia.findFirst({ where: { id: row.defaultOgImageMediaId, deletedAt: null }, select: { id: true, storageKey: true } }) : null,
    ]);
    return {
      siteTitle: row?.siteTitle ?? null,
      tagline: row?.tagline ?? null,
      homePageId: homePage?.id ?? null,
      homePage: homePage ?? null,
      blogPath: normaliseBlogPath(row?.blogPath),
      postsPerPage: row?.postsPerPage ?? 10,
      footerText: row?.footerText ?? null,
      socialLinks: (Array.isArray(row?.socialLinks) ? row.socialLinks : []) as Array<{ label: string; url: string }>,
      defaultMetaDescription: row?.defaultMetaDescription ?? null,
      defaultOgImage: ogImage ? { id: ogImage.id, url: this.storage.url(ogImage.storageKey) } : null,
      indexable: row?.indexable ?? true,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }
}
