import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";

import { RequirePermission } from "../../auth/auth.guard";
import { parseOrThrow } from "../../core/errors/validation";
import { readPageRequest } from "../../masters/paged";
import { ContentService, type ContentKind } from "./content.service";

/**
 * Two route families, one behaviour.
 *
 * `cms/pages` and `cms/posts` are the same fourteen handlers with a different
 * kind and a different permission prefix. Nest's decorators are static, so
 * the honest way to write that once is a class factory: each call stamps a
 * controller with its own paths and `@RequirePermission` keys, and both
 * delegate to the one service. Nothing here decides anything; every branch
 * belongs to the service, where a test can reach it without HTTP.
 */
const optionalText = (max: number) => z.string().trim().max(max).nullish();

const contentSchema = z.object({
  title: z.string().trim().min(1, "Give it a title.").max(200, "Titles are at most 200 characters."),
  slug: z.string().trim().max(120).optional(),
  excerpt: optionalText(1000),
  body: z.string().max(2_000_000, "That body is too large.").optional(),
  parentId: z.string().uuid("Not a page.").nullish(),
  menuOrder: z.number().int().min(-10_000).max(10_000).optional(),
  template: z.string().trim().min(1).max(60).optional(),
  featuredMediaId: z.string().uuid("Not a media item.").nullish(),
  metaTitle: optionalText(200),
  metaDescription: optionalText(400),
  canonicalUrl: z.string().trim().url("Not a valid URL.").max(500).nullish().or(z.literal("").transform(() => null)),
  noIndex: z.boolean().optional(),
  ogImageMediaId: z.string().uuid("Not a media item.").nullish(),
  isSticky: z.boolean().optional(),
  termIds: z.array(z.string().uuid()).max(100).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});

const publishSchema = z.object({
  at: z
    .string()
    .datetime({ offset: true, message: "Not a date and time." })
    .optional(),
});

const idSchema = z.string().uuid("Not an id.");

function contentController(kind: ContentKind, path: "pages" | "posts", key: "page" | "post") {
  const view = `cms.${key}.view`;
  const manage = `cms.${key}.manage`;
  const publish = `cms.${key}.publish`;

  @Controller({ path: `cms/${path}`, version: "1" })
  class KindController {
    constructor(@Inject(ContentService) readonly content: ContentService) {}

    @Get()
    @RequirePermission(view)
    list(@Query() query: Record<string, string>) {
      return this.content.list(kind, {
        ...readPageRequest(query),
        status: query["status"],
        search: query["search"]?.trim() || undefined,
        authorId: query["authorId"] || undefined,
        termId: query["termId"] || undefined,
        parentId: query["parentId"],
        sort: query["sort"],
      });
    }

    @Get("counts")
    @RequirePermission(view)
    counts() {
      return this.content.counts(kind);
    }

    @Get(":id")
    @RequirePermission(view)
    detail(@Param("id") id: string) {
      return this.content.detail(kind, parseOrThrow(idSchema, id));
    }

    @Post()
    @RequirePermission(manage)
    create(@Body() body: unknown) {
      return this.content.create(kind, parseOrThrow(contentSchema, body));
    }

    @Put(":id")
    @RequirePermission(manage)
    update(@Param("id") id: string, @Body() body: unknown) {
      return this.content.update(kind, parseOrThrow(idSchema, id), parseOrThrow(contentSchema, body));
    }

    @Post(":id/publish")
    @RequirePermission(publish)
    @HttpCode(200)
    publish(@Param("id") id: string, @Body() body: unknown) {
      const { at } = parseOrThrow(publishSchema, body ?? {});
      return this.content.publish(kind, parseOrThrow(idSchema, id), at ? new Date(at) : undefined);
    }

    @Post(":id/unpublish")
    @RequirePermission(publish)
    @HttpCode(200)
    unpublish(@Param("id") id: string) {
      return this.content.unpublish(kind, parseOrThrow(idSchema, id));
    }

    @Post(":id/archive")
    @RequirePermission(publish)
    @HttpCode(200)
    archive(@Param("id") id: string) {
      return this.content.archive(kind, parseOrThrow(idSchema, id));
    }

    @Post(":id/restore")
    @RequirePermission(publish)
    @HttpCode(200)
    restore(@Param("id") id: string) {
      return this.content.restore(kind, parseOrThrow(idSchema, id));
    }

    @Delete(":id")
    @RequirePermission(publish)
    @HttpCode(204)
    async trash(@Param("id") id: string) {
      await this.content.trash(kind, parseOrThrow(idSchema, id));
    }

    @Delete(":id/permanent")
    @RequirePermission(publish)
    @HttpCode(204)
    async destroy(@Param("id") id: string) {
      await this.content.destroy(kind, parseOrThrow(idSchema, id));
    }

    @Get(":id/revisions")
    @RequirePermission(view)
    revisions(@Param("id") id: string) {
      return this.content.revisions(kind, parseOrThrow(idSchema, id));
    }

    @Get(":id/revisions/:revisionId")
    @RequirePermission(view)
    revision(@Param("id") id: string, @Param("revisionId") revisionId: string) {
      return this.content.revision(kind, parseOrThrow(idSchema, id), parseOrThrow(idSchema, revisionId));
    }

    @Post(":id/revisions/:revisionId/restore")
    @RequirePermission(manage)
    @HttpCode(200)
    restoreRevision(@Param("id") id: string, @Param("revisionId") revisionId: string) {
      return this.content.restoreRevision(kind, parseOrThrow(idSchema, id), parseOrThrow(idSchema, revisionId));
    }

    @Post(":id/duplicate")
    @RequirePermission(manage)
    @HttpCode(201)
    duplicate(@Param("id") id: string) {
      return this.content.duplicate(kind, parseOrThrow(idSchema, id));
    }

    @Get(":id/preview-token")
    @RequirePermission(view)
    previewToken(@Param("id") id: string) {
      return this.content.previewToken(kind, parseOrThrow(idSchema, id));
    }
  }

  // Nest names providers and routes by class name; two anonymous
  // "KindController"s would be indistinguishable in its logs and its graph.
  Object.defineProperty(KindController, "name", { value: kind === "PAGE" ? "PagesController" : "PostsController" });
  return KindController;
}

export const PagesController = contentController("PAGE", "pages", "page");
export const PostsController = contentController("POST", "posts", "post");
