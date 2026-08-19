import { Injectable } from "@nestjs/common";

import { CacheService } from "../../core/cache/cache.service";
import { requireRequestContext } from "../../core/context/request-context";
import { PrismaService } from "../../core/database/prisma.service";
import { ConflictError, NotFoundError } from "../../core/errors/app-error";
import { ContentService } from "../content/content.service";
import { audit, termPath, type ClientTx, type CmsTaxonomy, type CmsTerm, type PathNode } from "../shared";
import { slugify } from "../slug";

/**
 * Categories and tags: one table, two shapes, the same four verbs.
 *
 * Categories nest and tags do not; the difference is a parent that is only
 * accepted for a category. Slugs are unique per taxonomy, and a clash is a
 * conflict rather than an automatic "-2": a person naming a category wants
 * to know it exists already, unlike a post title, where a duplicate is an
 * accident of the calendar. Delete lifts children to the grandparent and
 * detaches content; merge moves the content across and deletes the source.
 * Both — and a rename — clear the public cache, because archive pages,
 * menus and post cards all print the name.
 */
export interface TermInput {
  taxonomy: CmsTaxonomy;
  name: string;
  slug?: string;
  description?: string | null;
  parentId?: string | null;
}

@Injectable()
export class TermsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly content: ContentService,
  ) {}

  async list(query: { taxonomy?: string; search?: string }) {
    const { clientId } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => {
      const rows = await tx.cmsTerm.findMany({
        where: {
          ...(query.taxonomy === "CATEGORY" || query.taxonomy === "TAG" ? { taxonomy: query.taxonomy } : {}),
          ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
        },
        orderBy: [{ taxonomy: "asc" }, { name: "asc" }],
      });
      // Paths need every category, not only the ones the search matched.
      const nodes = await loadTermNodes(tx);
      return rows.map((row) => serialiseTerm(row, nodes));
    });
  }

  async create(input: TermInput) {
    const { clientId } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => {
      const slug = slugify(input.slug?.trim() || input.name);
      await this.assertSlugFree(tx, input.taxonomy, slug);
      const parentId = input.taxonomy === "CATEGORY" ? await this.checkParent(tx, input.parentId ?? null, null) : null;
      const row = await tx.cmsTerm.create({
        data: { clientId: clientId!, taxonomy: input.taxonomy, name: input.name.trim(), slug, description: input.description ?? null, parentId },
      });
      await audit(tx, { clientId: clientId!, action: "cms.term.created", entity: "cms_term", entityId: row.id, metadata: { taxonomy: row.taxonomy, name: row.name, slug: row.slug } });
      await this.cache.invalidateNamespace({ clientId: clientId! }, "cms");
      return serialiseTerm(row, await loadTermNodes(tx));
    });
  }

  async update(id: string, input: Partial<TermInput> & { name?: string }) {
    const { clientId } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => {
      const existing = await this.mustFind(tx, id);
      const slug = input.slug !== undefined && input.slug.trim() !== "" ? slugify(input.slug) : existing.slug;
      if (slug !== existing.slug) await this.assertSlugFree(tx, existing.taxonomy, slug, id);
      const parentId =
        existing.taxonomy === "CATEGORY" && input.parentId !== undefined ? await this.checkParent(tx, input.parentId, id) : existing.parentId;
      const row = await tx.cmsTerm.update({
        where: { id },
        data: {
          name: input.name?.trim() ?? existing.name,
          slug,
          description: input.description !== undefined ? input.description : existing.description,
          parentId,
        },
      });
      await audit(tx, { clientId: clientId!, action: "cms.term.updated", entity: "cms_term", entityId: id, metadata: { taxonomy: row.taxonomy, name: row.name, slug: row.slug, from: { name: existing.name, slug: existing.slug } } });
      await this.cache.invalidateNamespace({ clientId: clientId! }, "cms");
      return serialiseTerm(row, await loadTermNodes(tx));
    });
  }

  async remove(id: string): Promise<void> {
    const { clientId } = requireRequestContext();
    await this.prisma.forClient(clientId!, async (tx) => {
      const existing = await this.mustFind(tx, id);
      await tx.cmsTerm.updateMany({ where: { parentId: id }, data: { parentId: existing.parentId } });
      // The join rows cascade with the term; nothing to detach by hand.
      await tx.cmsTerm.delete({ where: { id } });
      await audit(tx, { clientId: clientId!, action: "cms.term.deleted", entity: "cms_term", entityId: id, metadata: { taxonomy: existing.taxonomy, name: existing.name, slug: existing.slug } });
      await this.cache.invalidateNamespace({ clientId: clientId! }, "cms");
    });
  }

  async merge(id: string, intoId: string) {
    const { clientId } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => {
      if (id === intoId) throw new ConflictError("A term cannot be merged into itself.", "invalid_merge");
      const source = await this.mustFind(tx, id);
      const target = await this.mustFind(tx, intoId);
      if (source.taxonomy !== target.taxonomy) throw new ConflictError("Categories and tags cannot be merged into each other.", "invalid_merge");

      const links = await tx.cmsContentTerm.findMany({ where: { termId: id }, select: { contentId: true } });
      const already = new Set(
        (await tx.cmsContentTerm.findMany({ where: { termId: intoId }, select: { contentId: true } })).map((row) => row.contentId),
      );
      const moving = links.map((row) => row.contentId).filter((contentId) => !already.has(contentId));
      if (moving.length > 0) {
        await tx.cmsContentTerm.createMany({ data: moving.map((contentId) => ({ clientId: clientId!, contentId, termId: intoId })) });
      }
      // Children lift to the grandparent, as on delete: putting them under
      // the target could make the target its own ancestor.
      await tx.cmsTerm.updateMany({ where: { parentId: id }, data: { parentId: source.parentId } });
      await tx.cmsTerm.delete({ where: { id } });
      await this.content.recomputeTermCounts(tx, [intoId]);
      await audit(tx, { clientId: clientId!, action: "cms.term.merged", entity: "cms_term", entityId: intoId, metadata: { from: { id, name: source.name, slug: source.slug }, into: { name: target.name, slug: target.slug }, moved: moving.length } });
      await this.cache.invalidateNamespace({ clientId: clientId! }, "cms");
      const row = await this.mustFind(tx, intoId);
      return serialiseTerm(row, await loadTermNodes(tx));
    });
  }

  private async mustFind(tx: ClientTx, id: string): Promise<CmsTerm> {
    const row = await tx.cmsTerm.findFirst({ where: { id } });
    if (!row) throw new NotFoundError("That category or tag");
    return row;
  }

  private async assertSlugFree(tx: ClientTx, taxonomy: CmsTaxonomy, slug: string, exceptId?: string): Promise<void> {
    const clash = await tx.cmsTerm.findFirst({ where: { taxonomy, slug, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
    if (clash) {
      throw new ConflictError(`A ${taxonomy === "CATEGORY" ? "category" : "tag"} with that slug already exists.`, "already_exists");
    }
  }

  private async checkParent(tx: ClientTx, parentId: string | null, selfId: string | null): Promise<string | null> {
    if (!parentId) return null;
    if (parentId === selfId) throw new ConflictError("A category cannot be its own parent.", "invalid_parent");
    const nodes = await loadTermNodes(tx);
    const parent = nodes.get(parentId);
    if (!parent) throw new NotFoundError("That parent category");
    let current: PathNode | undefined = parent;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      if (current.id === selfId) throw new ConflictError("A category cannot be moved under one of its own children.", "invalid_parent");
      seen.add(current.id);
      current = current.parentId ? nodes.get(current.parentId) : undefined;
    }
    return parentId;
  }
}

export async function loadTermNodes(tx: ClientTx): Promise<Map<string, PathNode>> {
  const rows = await tx.cmsTerm.findMany({ where: { taxonomy: "CATEGORY" }, select: { id: true, slug: true, parentId: true } });
  return new Map(rows.map((row) => [row.id, row]));
}

export function serialiseTerm(row: CmsTerm, nodes: ReadonlyMap<string, PathNode>) {
  return {
    id: row.id,
    taxonomy: row.taxonomy,
    name: row.name,
    slug: row.slug,
    description: row.description,
    parentId: row.parentId,
    count: row.count,
    path: row.taxonomy === "CATEGORY" ? termPath(row.id, nodes) : row.slug,
  };
}
