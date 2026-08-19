import { Body, Controller, Get, Put } from "@nestjs/common";
import { z } from "zod";

import { RequirePermission } from "../../auth/auth.guard";
import { parseOrThrow } from "../../core/errors/validation";
import { SettingsService } from "./settings.service";

/** Site settings: one GET, one PUT; every field optional so a form can send what it has. */
const optionalText = (max: number) => z.string().trim().max(max).nullish();

const settingsSchema = z.object({
  siteTitle: optionalText(120),
  tagline: optionalText(200),
  homePageId: z.string().uuid("Not a page.").nullish(),
  blogPath: z
    .string()
    .trim()
    .regex(/^\/?[a-z0-9-]+(\/[a-z0-9-]+)*\/?$/u, "The blog path is lowercase letters, digits and hyphens, like /blog.")
    .max(80)
    .optional(),
  postsPerPage: z.number().int().min(1, "At least one post per page.").max(50, "At most fifty posts per page.").optional(),
  footerText: optionalText(2000),
  socialLinks: z
    .array(z.object({ label: z.string().trim().min(1, "Give the link a label.").max(60), url: z.string().trim().url("Not a valid URL.").max(500) }))
    .max(20)
    .optional(),
  defaultMetaDescription: optionalText(400),
  defaultOgImageMediaId: z.string().uuid("Not a media item.").nullish(),
  indexable: z.boolean().optional(),
});

@Controller({ path: "cms/settings", version: "1" })
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequirePermission("cms.page.view")
  read() {
    return this.settings.read();
  }

  @Put()
  @RequirePermission("cms.settings.manage")
  write(@Body() body: unknown) {
    return this.settings.write(parseOrThrow(settingsSchema, body));
  }
}
