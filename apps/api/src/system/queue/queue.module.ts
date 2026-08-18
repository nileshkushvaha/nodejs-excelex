import { Module } from "@nestjs/common";

import { JobsModule } from "../../jobs/jobs.module";
import { QueueMonitorService } from "./queue-monitor.service";
import { QueueController } from "./queue.controller";

/**
 * The queue monitor: live counts from Redis, history from Postgres, and the
 * platform-wide queue actions. Built on the jobs module, which owns the
 * queues themselves.
 */
@Module({
  imports: [JobsModule],
  controllers: [QueueController],
  providers: [QueueMonitorService],
  exports: [QueueMonitorService],
})
export class QueueModule {}
