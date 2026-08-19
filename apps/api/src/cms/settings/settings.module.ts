import { Module } from "@nestjs/common";

import { SettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";

/** Site-wide settings: title, home page, blog path, SEO defaults. */
@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class CmsSettingsModule {}
