import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";

import { RequirePermission } from "../../auth/auth.guard";
import { parseOrThrow } from "../../core/errors/validation";
import { TermsService } from "./terms.service";

/**
 * Categories and tags over HTTP. Reading is a post-viewer's right — the
 * editor's sidebar needs the list — and changing is its own permission.
 */
const idSchema = z.string().uuid("Not an id.");

const createSchema = z.object({
  taxonomy: z.enum(["CATEGORY", "TAG"], { message: "Choose a category or a tag." }),
  name: z.string().trim().min(1, "Give it a name.").max(120, "Names are at most 120 characters."),
  slug: z.string().trim().max(120).optional(),
  description: z.string().trim().max(1000).nullish(),
  parentId: z.string().uuid("Not a category.").nullish(),
});

const updateSchema = createSchema.omit({ taxonomy: true }).partial();

const mergeSchema = z.object({ intoId: z.string().uuid("Not a term.") });

@Controller({ path: "cms/terms", version: "1" })
export class TermsController {
  constructor(private readonly terms: TermsService) {}

  @Get()
  @RequirePermission("cms.post.view")
  list(@Query() query: Record<string, string>) {
    return this.terms.list({ taxonomy: query["taxonomy"], search: query["search"]?.trim() || undefined });
  }

  @Post()
  @RequirePermission("cms.taxonomy.manage")
  create(@Body() body: unknown) {
    return this.terms.create(parseOrThrow(createSchema, body));
  }

  @Put(":id")
  @RequirePermission("cms.taxonomy.manage")
  update(@Param("id") id: string, @Body() body: unknown) {
    return this.terms.update(parseOrThrow(idSchema, id), parseOrThrow(updateSchema, body));
  }

  @Delete(":id")
  @RequirePermission("cms.taxonomy.manage")
  @HttpCode(204)
  async remove(@Param("id") id: string) {
    await this.terms.remove(parseOrThrow(idSchema, id));
  }

  @Post(":id/merge")
  @RequirePermission("cms.taxonomy.manage")
  @HttpCode(200)
  merge(@Param("id") id: string, @Body() body: unknown) {
    return this.terms.merge(parseOrThrow(idSchema, id), parseOrThrow(mergeSchema, body).intoId);
  }
}
