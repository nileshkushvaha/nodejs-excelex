import { Module, OnModuleInit } from "@nestjs/common";

import { JobRegistry } from "../../jobs/job.registry";
import { JOB_NAMES } from "../../jobs/job.types";
import { JobsModule } from "../../jobs/jobs.module";
import type { ClientTx } from "../shared";
import { PagesController, PostsController } from "./content.controller";
import { ContentService } from "./content.service";

/**
 * Pages and posts, and the job that publishes what was scheduled.
 *
 * The handler is registered here rather than in the jobs module because the
 * work is this feature's: the worker seals the client transaction and hands
 * it over, and the service does under it exactly what a publish click does.
 */
@Module({
  imports: [JobsModule],
  controllers: [PagesController, PostsController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule implements OnModuleInit {
  constructor(
    private readonly registry: JobRegistry,
    private readonly content: ContentService,
  ) {}

  onModuleInit(): void {
    this.registry.register(JOB_NAMES.CMS_PUBLISH_DUE, (envelope, tx) => this.content.publishDue(envelope.clientId, tx as ClientTx));
  }
}
