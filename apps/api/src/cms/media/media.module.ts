import { Module } from "@nestjs/common";

import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";
import { PublicMediaController } from "./public-media.controller";

/**
 * The media library and the public route that serves what it holds. Storage
 * and Prisma come from the global CoreModule; nothing here is exported
 * because other CMS areas reference media by id and resolve URLs through
 * StorageService directly.
 */
@Module({
  controllers: [MediaController, PublicMediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
