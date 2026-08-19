import { Injectable } from "@nestjs/common";
import type { Prisma } from "@excelex/database";
import { randomBytes } from "node:crypto";

import { CacheService } from "../../core/cache/cache.service";
import { requireRequestContext } from "../../core/context/request-context";
import { PrismaService } from "../../core/database/prisma.service";
import { ConflictError, NotFoundError } from "../../core/errors/app-error";
import { StorageService } from "../../core/storage/storage.service";
import { paginate, type PageRequest } from "../../masters/paged";
import { plainTextOf, sanitizeBody } from "../html-sanitizer";
import {
  actorId,
  audit,
  loadBlogPath,
  loadPageNodes,
  loadPeople,
  pagePath,
  postPath,
  type ClientTx,
  type CmsContent,
  type CmsKind,
  type CmsStatus,
  type CmsTerm,
  type PathNode,
} from "../shared";
import { slugify, uniqueSlug } from "../slug";

/**
 * Pages and posts: one service, because they are one table and one state
 * machine, and the two admin screens differ only in which columns they show.
 *
 * The status machine is deliberately small. DRAFT → SCHEDULED → PUBLISHED and
 * back to DRAFT; ARCHIVED for "keep, but off the site"; and the bin is not a
 * status at all but `deletedAt`, so a trashed item remembers whether it was
 * published and comes back exactly as it was. Every read the public site does
 * asks for PUBLISHED and not-deleted, and every write that could change what
 * the public site shows clears the client's `cms` cache namespace — a save on
 * a draft does not, because nothing public changed.
 *
 * Revisions are taken on every save that changed the words (title, slug,
 * excerpt or body); a save that only re-ordered a page or ticked "sticky"
 * would otherwise fill the history with entries a person cannot tell apart.
 * The snapshot carries the rest of the editable state so a restore is a
 * restore and not a partial one.
 *
 * A published page's path is a promise: renaming it, or moving it under a
 * different parent, records a redirect from the old path to the new one so
 * links out in the world keep working. Term counts are denormalised on the
 * term and recomputed for whichever terms a change could have touched, which
 * is cheaper to reason about than incrementing and decrementing by hand.
 */
export type ContentKind = CmsKind;

export interface ContentInput {
  title: string;
  slug?: string;
  excerpt?: string | null;
  body?: string;
  parentId?: string | null;
  menuOrder?: number;
  template?: string;
  featuredMediaId?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  canonicalUrl?: string | null;
  noIndex?: boolean;
  ogImageMediaId?: string | null;
  isSticky?: boolean;
  termIds?: string[];
  attributes?: Record<string, unknown>;
}

export interface ContentListQuery extends PageRequest {
  status?: string;
  search?: string;
  authorId?: string;
  termId?: string;
  parentId?: string;
  sort?: string;
}

type ContentWithTerms = CmsContent & { terms: Array<{ term: CmsTerm }>; _count: { revisions: number } };

const CONTENT_INCLUDE = { terms: { include: { term: true } }, _count: { select: { revisions: true } } } as const;
const STATUSES: readonly CmsStatus[] = ["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"];
const PREVIEW_TTL_SECONDS = 30 * 60;

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly storage: StorageService,
  ) {}

  // ── Reads ────────────────────────────────────────────────────────────────

  async list(kind: ContentKind, query: ContentListQuery) {
    const { clientId } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => {
      const where: Prisma.CmsContentWhereInput = {
        kind,
        ...statusWhere(query.status),
        ...(query.authorId ? { authorId: query.authorId } : {}),
        ...(query.termId ? { terms: { some: { termId: query.termId } } } : {}),
        ...(query.parentId !== undefined && kind === "PAGE"
          ? { parentId: query.parentId === "" || query.parentId === "null" ? null : query.parentId }
          : {}),
        ...(query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: "insensitive" } },
                { plainText: { contains: query.search, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const orderBy: Prisma.CmsContentOrderByWithRelationInput[] =
        query.sort === "title"
          ? [{ title: "asc" }]
          : query.sort === "published"
            ? [{ publishedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }]
            : [{ updatedAt: "desc" }];

      const page = await paginate<ContentWithTerms, ContentWithTerms>(
        tx.cmsContent,
        { where, include: CONTENT_INCLUDE, orderBy, request: query },
        (row) => row,
      );
      const rows = await this.serialiseRows(tx, page.rows);
      return { ...page, rows };
    });
  }

  async counts(kind: ContentKind) {
    const { clientId } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => {
      const [all, trash, grouped] = await Promise.all([
        tx.cmsContent.count({ where: { kind, deletedAt: null } }),
        tx.cmsContent.count({ where: { kind, deletedAt: { not: null } } }),
        tx.cmsContent.groupBy({ by: ["status"], where: { kind, deletedAt: null }, _count: { _all: true } }),
      ]);
      const byStatus = Object.fromEntries(grouped.map((row) => [row.status, row._count._all]));
      return {
        all,
        DRAFT: byStatus["DRAFT"] ?? 0,
        SCHEDULED: byStatus["SCHEDULED"] ?? 0,
        PUBLISHED: byStatus["PUBLISHED"] ?? 0,
        ARCHIVED: byStatus["ARCHIVED"] ?? 0,
        TRASH: trash,
      };
    });
  }

  async detail(kind: ContentKind, id: string) {
    const { clientId } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => this.serialiseDetail(tx, await this.mustFind(tx, kind, id)));
  }

  // ── Create / update ──────────────────────────────────────────────────────

  async create(kind: ContentKind, input: ContentInput) {
    const { clientId } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => {
      const created = await this.insert(tx, clientId!, kind, input, { title: input.title, reason: "save" });
      await audit(tx, { clientId: clientId!, action: `cms.${entityOf(kind)}.created`, entity: entityOf(kind), entityId: created.id, metadata: { title: created.title, slug: created.slug } });
      return { id: created.id, slug: created.slug, path: await this.pathOf(tx, created) };
    });
  }

  async update(kind: ContentKind, id: string, input: ContentInput) {
    const { clientId } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => {
      const existing = await this.mustFind(tx, kind, id);
      const updated = await this.applyChanges(tx, clientId!, existing, input, "save");
      await audit(tx, { clientId: clientId!, action: `cms.${entityOf(kind)}.updated`, entity: entityOf(kind), entityId: id, metadata: { title: updated.title, slug: updated.slug } });
      return this.serialiseDetail(tx, updated);
    });
  }

  private async insert(
    tx: ClientTx,
    clientId: string,
    kind: ContentKind,
    input: ContentInput,
    options: { title: string; reason: string; status?: CmsStatus },
  ): Promise<ContentWithTerms> {
    const slug = await this.freeSlug(tx, kind, input.slug ? slugify(input.slug) : slugify(options.title));
    const body = sanitizeBody(input.body ?? "");
    const parentId = kind === "PAGE" ? await this.checkParent(tx, input.parentId ?? null, null) : null;
    const termIds = kind === "POST" ? await this.checkTerms(tx, input.termIds ?? []) : [];
    const who = actorId();

    const created = await tx.cmsContent.create({
      data: {
        clientId,
        kind,
        status: options.status ?? "DRAFT",
        title: options.title,
        slug,
        excerpt: input.excerpt ?? null,
        body,
        plainText: plainTextOf(body),
        parentId,
        menuOrder: input.menuOrder ?? 0,
        template: input.template ?? "default",
        featuredMediaId: input.featuredMediaId ?? null,
        metaTitle: input.metaTitle ?? null,
        metaDescription: input.metaDescription ?? null,
        canonicalUrl: input.canonicalUrl ?? null,
        noIndex: input.noIndex ?? false,
        ogImageMediaId: input.ogImageMediaId ?? null,
        isSticky: kind === "POST" ? (input.isSticky ?? false) : false,
        attributes: (input.attributes ?? {}) as never,
        authorId: who,
        createdById: who,
        updatedById: who,
      },
    });
    // Sequential rather than nested: the client barrier does not see nested writes.
    if (termIds.length > 0) {
      await tx.cmsContentTerm.createMany({ data: termIds.map((termId) => ({ clientId, contentId: created.id, termId })) });
    }
    const withTerms = await tx.cmsContent.findFirstOrThrow({ where: { id: created.id }, include: CONTENT_INCLUDE });
    await this.snapshot(tx, clientId, withTerms, options.reason);
    return withTerms;
  }

  /**
   * The one place a row's editable fields change. Update, restore and
   * duplicate-then-edit all come through here so the redirect rule, the
   * revision rule and the term-count rule cannot drift apart.
   */
  private async applyChanges(tx: ClientTx, clientId: string, existing: ContentWithTerms, input: ContentInput, reason: string): Promise<ContentWithTerms> {
    const kind = existing.kind;
    const oldPath = await this.pathOf(tx, existing);
    const wantedSlug = input.slug !== undefined && input.slug !== "" ? slugify(input.slug) : existing.slug;
    const slug = wantedSlug === existing.slug ? existing.slug : await this.freeSlug(tx, kind, wantedSlug, existing.id);
    const body = input.body !== undefined ? sanitizeBody(input.body) : existing.body;
    const parentId = kind === "PAGE" && input.parentId !== undefined ? await this.checkParent(tx, input.parentId, existing.id) : existing.parentId;
    const oldTermIds = existing.terms.map((link) => link.term.id);
    const termIds = kind === "POST" && input.termIds !== undefined ? await this.checkTerms(tx, input.termIds) : oldTermIds;
    const termsChanged = input.termIds !== undefined && !sameSet(oldTermIds, termIds);

    await tx.cmsContent.update({
      where: { id: existing.id },
      data: {
        title: input.title,
        slug,
        excerpt: input.excerpt !== undefined ? input.excerpt : existing.excerpt,
        body,
        plainText: input.body !== undefined ? plainTextOf(body) : existing.plainText,
        parentId,
        menuOrder: input.menuOrder ?? existing.menuOrder,
        template: input.template ?? existing.template,
        featuredMediaId: input.featuredMediaId !== undefined ? input.featuredMediaId : existing.featuredMediaId,
        metaTitle: input.metaTitle !== undefined ? input.metaTitle : existing.metaTitle,
        metaDescription: input.metaDescription !== undefined ? input.metaDescription : existing.metaDescription,
        canonicalUrl: input.canonicalUrl !== undefined ? input.canonicalUrl : existing.canonicalUrl,
        noIndex: input.noIndex ?? existing.noIndex,
        ogImageMediaId: input.ogImageMediaId !== undefined ? input.ogImageMediaId : existing.ogImageMediaId,
        isSticky: kind === "POST" ? (input.isSticky ?? existing.isSticky) : false,
        attributes: (input.attributes ?? existing.attributes) as never,
        updatedById: actorId(),
      },
    });
    if (termsChanged) {
      await tx.cmsContentTerm.deleteMany({ where: { contentId: existing.id } });
      if (termIds.length > 0) {
        await tx.cmsContentTerm.createMany({ data: termIds.map((termId) => ({ clientId, contentId: existing.id, termId })) });
      }
    }
    const updated = await tx.cmsContent.findFirstOrThrow({ where: { id: existing.id }, include: CONTENT_INCLUDE });

    const wordsChanged =
      updated.title !== existing.title || updated.slug !== existing.slug || updated.body !== existing.body || (updated.excerpt ?? "") !== (existing.excerpt ?? "");
    if (wordsChanged || reason !== "save") await this.snapshot(tx, clientId, updated, reason);

    // The path is a promise only once the item is public.
    const newPath = await this.pathOf(tx, updated);
    if (existing.status === "PUBLISHED" && !existing.deletedAt && newPath !== oldPath) {
      await this.recordRedirect(tx, clientId, oldPath, newPath);
    }
    if (termsChanged) await this.recomputeTermCounts(tx, [...oldTermIds, ...termIds]);
    if (existing.status === "PUBLISHED" && !existing.deletedAt) await this.cache.invalidateNamespace({ clientId }, "cms");
    return updated;
  }

  private async recordRedirect(tx: ClientTx, clientId: string, fromPath: string, toPath: string): Promise<void> {
    if (fromPath === toPath || fromPath === "/") return;
    await tx.cmsRedirect.upsert({
      where: { clientId_fromPath: { clientId, fromPath } },
      create: { clientId, fromPath, toPath, statusCode: 301 },
      update: { toPath, statusCode: 301 },
    });
    // A redirect pointing at what is now a real page would shadow it, and a
    // rename back to the old name must not loop.
    await tx.cmsRedirect.deleteMany({ where: { fromPath: toPath } });
    await audit(tx, { clientId, action: "cms.redirect.created", entity: "cms_redirect", entityId: null, metadata: { fromPath, toPath, statusCode: 301 } });
  }

  // ── Publish state machine ────────────────────────────────────────────────

  async publish(kind: ContentKind, id: string, at?: Date) {
    return this.transition(kind, id, "publish", (row) => {
      if (row.deletedAt) throw new ConflictError("An item in the bin cannot be published. Restore it first.", "in_trash");
      const now = new Date();
      if (at && at.getTime() > now.getTime()) return { status: "SCHEDULED", scheduledFor: at };
      return { status: "PUBLISHED", scheduledFor: null, publishedAt: row.publishedAt ?? now };
    });
  }

  async unpublish(kind: ContentKind, id: string) {
    return this.transition(kind, id, "unpublish", () => ({ status: "DRAFT", publishedAt: null, scheduledFor: null }));
  }

  async archive(kind: ContentKind, id: string) {
    return this.transition(kind, id, "archive", () => ({ status: "ARCHIVED", scheduledFor: null }));
  }

  async restore(kind: ContentKind, id: string) {
    return this.transition(kind, id, "restore", (row) => {
      if (!row.deletedAt && row.status !== "ARCHIVED") {
        throw new ConflictError("Only an archived item or one in the bin can be restored.", "not_restorable");
      }
      return { status: "DRAFT", deletedAt: null, scheduledFor: null };
    });
  }

  async trash(kind: ContentKind, id: string) {
    await this.transition(kind, id, "trash", (row) => {
      if (row.deletedAt) throw new ConflictError("That item is already in the bin.", "in_trash");
      return { deletedAt: new Date() };
    });
  }

  async destroy(kind: ContentKind, id: string) {
    const { clientId } = requireRequestContext();
    await this.prisma.forClient(clientId!, async (tx) => {
      const row = await this.mustFind(tx, kind, id);
      const termIds = row.terms.map((link) => link.term.id);
      await tx.cmsContent.updateMany({ where: { parentId: id }, data: { parentId: row.parentId } });
      await tx.cmsContent.delete({ where: { id } });
      await this.recomputeTermCounts(tx, termIds);
      await audit(tx, { clientId: clientId!, action: `cms.${entityOf(kind)}.deleted`, entity: entityOf(kind), entityId: id, metadata: { title: row.title, slug: row.slug, permanent: true } });
      await this.cache.invalidateNamespace({ clientId: clientId! }, "cms");
    });
  }

  private async transition(
    kind: ContentKind,
    id: string,
    verb: string,
    change: (row: ContentWithTerms) => Prisma.CmsContentUncheckedUpdateInput,
  ) {
    const { clientId } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => {
      const row = await this.mustFind(tx, kind, id);
      const data = change(row);
      const updated = await tx.cmsContent.update({ where: { id }, data: { ...data, updatedById: actorId() }, include: CONTENT_INCLUDE });
      await this.recomputeTermCounts(tx, updated.terms.map((link) => link.term.id));
      await audit(tx, {
        clientId: clientId!,
        action: `cms.${entityOf(kind)}.${verb === "trash" ? "trashed" : `${verb}${verb.endsWith("e") ? "d" : "ed"}`}`,
        entity: entityOf(kind),
        entityId: id,
        metadata: { title: updated.title, from: row.status, to: updated.status, scheduledFor: updated.scheduledFor?.toISOString() ?? null },
      });
      await this.cache.invalidateNamespace({ clientId: clientId! }, "cms");
      return this.serialiseDetail(tx, updated);
    });
  }

  /**
   * The scheduler's job: SCHEDULED rows whose time has come go live, with
   * publishedAt set to the moment they were meant for, not the moment the
   * job happened to run — a post scheduled for nine o'clock says nine.
   */
  async publishDue(clientId: string, tx?: ClientTx): Promise<{ published: number }> {
    const run = async (t: ClientTx) => {
      const due = await t.cmsContent.findMany({
        where: { status: "SCHEDULED", deletedAt: null, scheduledFor: { lte: new Date() } },
        include: CONTENT_INCLUDE,
      });
      for (const row of due) {
        await t.cmsContent.update({
          where: { id: row.id },
          data: { status: "PUBLISHED", publishedAt: row.publishedAt ?? row.scheduledFor ?? new Date(), scheduledFor: null },
        });
        await audit(t, { clientId, action: `cms.${entityOf(row.kind)}.published`, entity: entityOf(row.kind), entityId: row.id, metadata: { title: row.title, from: "SCHEDULED", to: "PUBLISHED", scheduled: true } });
      }
      await this.recomputeTermCounts(t, due.flatMap((row) => row.terms.map((link) => link.term.id)));
      if (due.length > 0) await this.cache.invalidateNamespace({ clientId }, "cms");
      return { published: due.length };
    };
    return tx ? run(tx) : this.prisma.forClient(clientId, run);
  }

  // ── Revisions ────────────────────────────────────────────────────────────

  async revisions(kind: ContentKind, id: string) {
    const { clientId } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => {
      await this.mustFind(tx, kind, id);
      const rows = await tx.cmsRevision.findMany({ where: { contentId: id }, orderBy: { createdAt: "desc" } });
      const people = await loadPeople(tx, rows.map((row) => row.authorId));
      return rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        reason: row.reason,
        author: row.authorId ? (people.get(row.authorId) ?? null) : null,
        title: row.title,
        slug: row.slug,
        bodyLength: row.body.length,
      }));
    });
  }

  async revision(kind: ContentKind, id: string, revisionId: string) {
    const { clientId } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => {
      await this.mustFind(tx, kind, id);
      const row = await tx.cmsRevision.findFirst({ where: { id: revisionId, contentId: id } });
      if (!row) throw new NotFoundError("That revision");
      const people = await loadPeople(tx, [row.authorId]);
      return {
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        reason: row.reason,
        author: row.authorId ? (people.get(row.authorId) ?? null) : null,
        title: row.title,
        slug: row.slug,
        bodyLength: row.body.length,
        body: row.body,
        excerpt: row.excerpt,
        snapshot: row.snapshot,
      };
    });
  }

  async restoreRevision(kind: ContentKind, id: string, revisionId: string) {
    const { clientId } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => {
      const existing = await this.mustFind(tx, kind, id);
      const revision = await tx.cmsRevision.findFirst({ where: { id: revisionId, contentId: id } });
      if (!revision) throw new NotFoundError("That revision");
      const snapshot = (revision.snapshot ?? {}) as Partial<ContentInput>;
      const updated = await this.applyChanges(
        tx,
        clientId!,
        existing,
        {
          title: revision.title,
          slug: revision.slug,
          excerpt: revision.excerpt,
          body: revision.body,
          parentId: snapshot.parentId,
          menuOrder: snapshot.menuOrder,
          template: snapshot.template,
          featuredMediaId: snapshot.featuredMediaId,
          metaTitle: snapshot.metaTitle,
          metaDescription: snapshot.metaDescription,
          canonicalUrl: snapshot.canonicalUrl,
          noIndex: snapshot.noIndex,
          ogImageMediaId: snapshot.ogImageMediaId,
          isSticky: snapshot.isSticky,
          termIds: snapshot.termIds,
          attributes: snapshot.attributes,
        },
        "restore",
      );
      await audit(tx, { clientId: clientId!, action: `cms.${entityOf(kind)}.revision_restored`, entity: entityOf(kind), entityId: id, metadata: { revisionId, revisionAt: revision.createdAt.toISOString() } });
      return this.serialiseDetail(tx, updated);
    });
  }

  private async snapshot(tx: ClientTx, clientId: string, row: ContentWithTerms, reason: string): Promise<void> {
    await tx.cmsRevision.create({
      data: {
        clientId,
        contentId: row.id,
        title: row.title,
        slug: row.slug,
        excerpt: row.excerpt,
        body: row.body,
        reason,
        authorId: actorId(),
        snapshot: {
          parentId: row.parentId,
          menuOrder: row.menuOrder,
          template: row.template,
          featuredMediaId: row.featuredMediaId,
          metaTitle: row.metaTitle,
          metaDescription: row.metaDescription,
          canonicalUrl: row.canonicalUrl,
          noIndex: row.noIndex,
          ogImageMediaId: row.ogImageMediaId,
          isSticky: row.isSticky,
          termIds: row.terms.map((link) => link.term.id),
          attributes: row.attributes,
        } as never,
      },
    });
  }

  // ── Duplicate, preview ───────────────────────────────────────────────────

  async duplicate(kind: ContentKind, id: string) {
    const { clientId } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => {
      const source = await this.mustFind(tx, kind, id);
      const copy = await this.insert(
        tx,
        clientId!,
        kind,
        {
          title: `Copy of ${source.title}`,
          excerpt: source.excerpt,
          body: source.body,
          parentId: source.parentId,
          menuOrder: source.menuOrder,
          template: source.template,
          featuredMediaId: source.featuredMediaId,
          metaTitle: source.metaTitle,
          metaDescription: source.metaDescription,
          canonicalUrl: null,
          noIndex: source.noIndex,
          ogImageMediaId: source.ogImageMediaId,
          isSticky: false,
          termIds: source.terms.map((link) => link.term.id),
          attributes: (source.attributes ?? {}) as Record<string, unknown>,
        },
        { title: `Copy of ${source.title}`, reason: "save" },
      );
      await audit(tx, { clientId: clientId!, action: `cms.${entityOf(kind)}.duplicated`, entity: entityOf(kind), entityId: copy.id, metadata: { sourceId: id, title: copy.title } });
      return { id: copy.id, slug: copy.slug, path: await this.pathOf(tx, copy) };
    });
  }

  /**
   * A bearer for one unpublished item, half an hour long. Lives in the cms
   * cache namespace as the contract asks; a publish-affecting write clears
   * that namespace, so a token minted before someone else publishes
   * something needs minting again — the editor asks for a fresh one when the
   * preview says so.
   */
  async previewToken(kind: ContentKind, id: string) {
    const { clientId } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => {
      await this.mustFind(tx, kind, id);
      const token = randomBytes(24).toString("hex");
      await this.cache.set({ clientId: clientId! }, "cms", `preview.${token}`, { contentId: id, kind }, PREVIEW_TTL_SECONDS);
      return { token, expiresAt: new Date(Date.now() + PREVIEW_TTL_SECONDS * 1000).toISOString() };
    });
  }

  /** What a preview token names, or null when unknown or expired. */
  resolvePreview(clientId: string, token: string): Promise<{ contentId: string; kind: ContentKind } | undefined> {
    if (!/^[a-f0-9]{48}$/u.test(token)) return Promise.resolve(undefined);
    return this.cache.get<{ contentId: string; kind: ContentKind }>({ clientId }, "cms", `preview.${token}`);
  }

  // ── Term counts ──────────────────────────────────────────────────────────

  async recomputeTermCounts(tx: ClientTx, termIds: Iterable<string>): Promise<void> {
    const unique = [...new Set(termIds)];
    for (const termId of unique) {
      const count = await tx.cmsContent.count({
        where: { kind: "POST", status: "PUBLISHED", deletedAt: null, terms: { some: { termId } } },
      });
      await tx.cmsTerm.updateMany({ where: { id: termId }, data: { count } });
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async mustFind(tx: ClientTx, kind: ContentKind, id: string): Promise<ContentWithTerms> {
    const row = await tx.cmsContent.findFirst({ where: { id, kind }, include: CONTENT_INCLUDE });
    if (!row) throw new NotFoundError(kind === "PAGE" ? "That page" : "That post");
    return row;
  }

  private async freeSlug(tx: ClientTx, kind: ContentKind, base: string, exceptId?: string): Promise<string> {
    const taken = await tx.cmsContent.findMany({
      where: { kind, slug: { startsWith: base }, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { slug: true },
    });
    return uniqueSlug(base, new Set(taken.map((row) => row.slug)));
  }

  private async checkParent(tx: ClientTx, parentId: string | null, selfId: string | null): Promise<string | null> {
    if (!parentId) return null;
    if (parentId === selfId) throw new ConflictError("A page cannot be its own parent.", "invalid_parent");
    const nodes = await loadPageNodes(tx);
    if (!nodes.has(parentId)) throw new NotFoundError("That parent page");
    // Walk up from the proposed parent; meeting ourselves means a cycle.
    let current: PathNode | undefined = nodes.get(parentId);
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      if (current.id === selfId) throw new ConflictError("A page cannot be moved under one of its own children.", "invalid_parent");
      seen.add(current.id);
      current = current.parentId ? nodes.get(current.parentId) : undefined;
    }
    return parentId;
  }

  private async checkTerms(tx: ClientTx, termIds: string[]): Promise<string[]> {
    const unique = [...new Set(termIds)];
    if (unique.length === 0) return [];
    const found = await tx.cmsTerm.findMany({ where: { id: { in: unique } }, select: { id: true } });
    if (found.length !== unique.length) throw new NotFoundError("One of those categories or tags");
    return unique;
  }

  private async pathOf(tx: ClientTx, row: CmsContent): Promise<string> {
    if (row.kind === "PAGE") return pagePath(row.id, await loadPageNodes(tx));
    return postPath(await loadBlogPath(tx), row.slug);
  }

  private async serialiseRows(tx: ClientTx, rows: ContentWithTerms[]) {
    const [nodes, blogPath, people, media] = await Promise.all([
      loadPageNodes(tx),
      loadBlogPath(tx),
      loadPeople(tx, rows.flatMap((row) => [row.authorId, row.updatedById])),
      this.loadMedia(tx, rows.flatMap((row) => [row.featuredMediaId, row.ogImageMediaId])),
    ]);
    return rows.map((row) => this.serialiseRow(row, { nodes, blogPath, people, media }));
  }

  private async serialiseDetail(tx: ClientTx, row: ContentWithTerms) {
    const [base] = await this.serialiseRows(tx, [row]);
    const people = await loadPeople(tx, [row.updatedById]);
    const media = await this.loadMedia(tx, [row.ogImageMediaId]);
    const og = row.ogImageMediaId ? media.get(row.ogImageMediaId) : undefined;
    return {
      ...base!,
      body: row.body,
      plainText: row.plainText,
      metaTitle: row.metaTitle,
      metaDescription: row.metaDescription,
      canonicalUrl: row.canonicalUrl,
      noIndex: row.noIndex,
      ogImage: og ? { id: og.id, url: og.url } : null,
      attributes: row.attributes,
      deletedAt: row.deletedAt?.toISOString() ?? null,
      updatedBy: row.updatedById ? (people.get(row.updatedById) ?? null) : null,
    };
  }

  private serialiseRow(
    row: ContentWithTerms,
    lookups: {
      nodes: Map<string, PathNode>;
      blogPath: string;
      people: Map<string, { id: string; fullName: string }>;
      media: Map<string, MediaRef>;
    },
  ) {
    const featured = row.featuredMediaId ? lookups.media.get(row.featuredMediaId) : undefined;
    return {
      id: row.id,
      kind: row.kind,
      status: row.deletedAt ? "TRASH" : row.status,
      title: row.title,
      slug: row.slug,
      excerpt: row.excerpt,
      path: row.kind === "PAGE" ? pagePath(row.id, lookups.nodes) : postPath(lookups.blogPath, row.slug),
      template: row.template,
      parentId: row.parentId,
      menuOrder: row.menuOrder,
      isSticky: row.isSticky,
      author: row.authorId ? (lookups.people.get(row.authorId) ?? null) : null,
      featuredMedia: featured ?? null,
      terms: row.terms.map((link) => ({ id: link.term.id, taxonomy: link.term.taxonomy, name: link.term.name, slug: link.term.slug })),
      publishedAt: row.publishedAt?.toISOString() ?? null,
      scheduledFor: row.scheduledFor?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      revisionCount: row._count.revisions,
    };
  }

  /** Media rows another workstream writes; read here only to print URLs. */
  async loadMedia(tx: ClientTx, ids: Iterable<string | null | undefined>): Promise<Map<string, MediaRef>> {
    const wanted = [...new Set([...ids].filter((id): id is string => !!id))];
    if (wanted.length === 0) return new Map();
    const rows = await tx.cmsMedia.findMany({ where: { id: { in: wanted }, deletedAt: null } });
    return new Map(
      rows.map((row) => [
        row.id,
        { id: row.id, url: this.storage.url(row.storageKey), altText: row.altText, width: row.width, height: row.height },
      ]),
    );
  }
}

export interface MediaRef {
  id: string;
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
}

export function entityOf(kind: ContentKind): "page" | "post" {
  return kind === "PAGE" ? "page" : "post";
}

/** The status filter's vocabulary: four real statuses and the bin. */
export function statusWhere(status: string | undefined): Prisma.CmsContentWhereInput {
  if (!status || status === "all") return { deletedAt: null };
  if (status === "TRASH") return { deletedAt: { not: null } };
  if ((STATUSES as readonly string[]).includes(status)) return { deletedAt: null, status: status as CmsStatus };
  return { deletedAt: null };
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}
