import { Module } from "@nestjs/common";

import { JobsModule } from "../../jobs/jobs.module";
import { ScheduleService } from "./schedule.service";
import { SchedulerController } from "./scheduler.controller";
import { SchedulerService } from "./scheduler.service";

/**
 * The scheduler: schedule CRUD for a client, and the one dispatcher that
 * turns every client's schedules into jobs. Built on the jobs module because
 * dispatching is enqueuing.
 */
@Module({
  imports: [JobsModule],
  controllers: [SchedulerController],
  providers: [ScheduleService, SchedulerService],
  exports: [ScheduleService, SchedulerService],
})
export class SchedulerModule {}
