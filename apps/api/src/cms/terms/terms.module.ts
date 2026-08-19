import { Module } from "@nestjs/common";

import { ContentModule } from "../content/content.module";
import { TermsController } from "./terms.controller";
import { TermsService } from "./terms.service";

/** Categories and tags. Leans on the content service for term counts. */
@Module({
  imports: [ContentModule],
  controllers: [TermsController],
  providers: [TermsService],
  exports: [TermsService],
})
export class TermsModule {}
