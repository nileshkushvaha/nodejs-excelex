import { Module } from "@nestjs/common";

import { JobsModule } from "../jobs/jobs.module";
import { QueueController } from "./queue/queue.controller";

/**
 * The System screens: operating the account rather than using it.
 *
 * Queue monitor, scheduler, cache manager, activity log, login history and
 * application performance. Each is its own folder with a controller and a
 * service; this module is only the list. Every route lives under
 * /api/v1/system and every permission under system.* (the activity log reads
 * the audit trail, so it keeps settings.audit.view).
 */
@Module({
  imports: [JobsModule],
  controllers: [QueueController],
  providers: [],
})
export class SystemModule {}
