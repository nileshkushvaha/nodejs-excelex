import { Module } from "@nestjs/common";

import { JobsModule } from "../jobs/jobs.module";

/**
 * Content management (ADR-0006): pages, posts, taxonomies, media, menus,
 * site settings, and the public read API the client's site renders from.
 * Each area is its own folder with a controller and service; this module is
 * the list. Admin routes live under /api/v1/cms/*, public reads under
 * /api/v1/public/*.
 */
@Module({
  imports: [JobsModule],
  controllers: [],
  providers: [],
})
export class CmsModule {}
