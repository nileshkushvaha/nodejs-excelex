import { Module } from "@nestjs/common";

import { MenusController } from "./menus.controller";
import { MenusService } from "./menus.service";

/** Navigation menus by location; the public read reuses the tree builder. */
@Module({
  controllers: [MenusController],
  providers: [MenusService],
  exports: [MenusService],
})
export class MenusModule {}
