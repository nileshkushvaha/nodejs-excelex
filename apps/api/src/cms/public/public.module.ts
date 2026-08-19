import { Module } from "@nestjs/common";

import { ContentModule } from "../content/content.module";
import { PublicController } from "./public.controller";
import { PublicService } from "./public.service";

/** The public read API for a client's site. Media serving is added by the media area. */
@Module({
  imports: [ContentModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class CmsPublicModule {}
