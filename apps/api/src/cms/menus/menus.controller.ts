import { Body, Controller, Delete, Get, HttpCode, Param, Put } from "@nestjs/common";
import { z } from "zod";

import { RequirePermission } from "../../auth/auth.guard";
import { parseOrThrow } from "../../core/errors/validation";
import { MenusService, type MenuItemInput } from "./menus.service";

/**
 * Menus over HTTP: read the lot, replace one location, drop one location.
 * The tree schema is recursive and capped at four levels deep and two
 * hundred items — a navigation menu, not a sitemap.
 */
const itemSchema: z.ZodType<MenuItemInput> = z.lazy(() =>
  z
    .object({
      label: z.string().trim().min(1, "Every menu item needs a label.").max(120),
      description: z.string().trim().max(300).nullish(),
      contentId: z.string().uuid("Not a page or post.").nullish(),
      termId: z.string().uuid("Not a category or tag.").nullish(),
      url: z.string().trim().max(1000).nullish(),
      openInNewTab: z.boolean().optional(),
      children: z.array(itemSchema).max(50).optional(),
    })
    .refine((item) => item.contentId || item.termId || (item.url && item.url.length > 0), {
      message: "A menu item must point at a page, a post, a category, a tag or a URL.",
      path: ["url"],
    }),
);

const menuSchema = z.object({
  name: z.string().trim().min(1, "Give the menu a name.").max(120),
  items: z.array(itemSchema).max(200),
});

const locationSchema = z.string().regex(/^[a-z][a-z0-9-]{0,40}$/u, "Not a menu location.");

@Controller({ path: "cms/menus", version: "1" })
export class MenusController {
  constructor(private readonly menus: MenusService) {}

  @Get()
  @RequirePermission("cms.page.view")
  list() {
    return this.menus.list();
  }

  @Put(":location")
  @RequirePermission("cms.menu.manage")
  replace(@Param("location") location: string, @Body() body: unknown) {
    return this.menus.replace(parseOrThrow(locationSchema, location), parseOrThrow(menuSchema, body));
  }

  @Delete(":location")
  @RequirePermission("cms.menu.manage")
  @HttpCode(204)
  async remove(@Param("location") location: string) {
    await this.menus.remove(parseOrThrow(locationSchema, location));
  }
}
