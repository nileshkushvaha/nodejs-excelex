import { Controller, Get, Param, Query, Req } from "@nestjs/common";
import type { Request } from "express";

import { PublicRoute } from "../../auth/auth.guard";
import { PublicService } from "./public.service";

/**
 * The public read API: no session, no permission, the client from the host.
 *
 * `pages/*path` takes the whole remainder because pages nest; Express 5
 * hands a named wildcard back as an array of segments, joined here. A
 * `?preview=` token is passed through untouched — the service decides what
 * it is worth.
 */
@Controller({ path: "public", version: "1" })
export class PublicController {
  constructor(private readonly site: PublicService) {}

  @Get("site")
  @PublicRoute()
  siteInfo() {
    return this.site.site();
  }

  @Get("pages/*path")
  @PublicRoute()
  page(@Req() req: Request, @Query("preview") preview?: string) {
    const raw = (req.params as Record<string, string | string[]>)["path"];
    const path = Array.isArray(raw) ? raw.join("/") : (raw ?? "");
    return this.site.page(decodeURIComponent(path), preview || undefined);
  }

  @Get("posts")
  @PublicRoute()
  posts(@Query() query: Record<string, string>) {
    return this.site.posts({
      page: query["page"],
      pageSize: query["pageSize"],
      category: query["category"]?.trim() || undefined,
      tag: query["tag"]?.trim() || undefined,
      search: query["search"]?.trim() || undefined,
      author: query["author"]?.trim() || undefined,
    });
  }

  @Get("posts/:slug")
  @PublicRoute()
  post(@Param("slug") slug: string, @Query("preview") preview?: string) {
    return this.site.post(slug, preview || undefined);
  }

  @Get("categories")
  @PublicRoute()
  categories() {
    return this.site.categories();
  }

  @Get("tags")
  @PublicRoute()
  tags() {
    return this.site.tags();
  }

  @Get("sitemap")
  @PublicRoute()
  sitemap() {
    return this.site.sitemap();
  }

  @Get("feed")
  @PublicRoute()
  feed() {
    return this.site.feed();
  }
}
