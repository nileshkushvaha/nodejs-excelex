import { Module, OnModuleInit } from "@nestjs/common";

import { registerRetentionSweep } from "./handlers/retention-sweep.handler";
import { JobRegistry, registerHeartbeat } from "./job.registry";
import { JobService } from "./job.service";
import { QueueService } from "./queue.service";
import { WorkerService } from "./worker.service";

/**
 * The queue: enqueuing, running, and the record of both.
 *
 * Exported so a feature can enqueue its own work and register its own
 * handler; the System module builds the monitor and the scheduler on top.
 */
@Module({
  providers: [QueueService, JobService, JobRegistry, WorkerService],
  exports: [QueueService, JobService, JobRegistry],
})
export class JobsModule implements OnModuleInit {
  constructor(private readonly registry: JobRegistry) {}

  /**
   * The handlers that are not owned by a feature.
   *
   * Registered here rather than in the registry's constructor so the list of
   * what this system can run in the background is readable in one place.
   */
  onModuleInit(): void {
    registerHeartbeat(this.registry);
    registerRetentionSweep(this.registry);
  }
}
