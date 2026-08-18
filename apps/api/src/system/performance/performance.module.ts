import { Module } from "@nestjs/common";

import { JobsModule } from "../../jobs/jobs.module";
import { PerformanceController } from "./performance.controller";
import { PerformanceService } from "./performance.service";

/**
 * Application performance: latency, errors, event loop, database and queue
 * health for this API instance. Imports the queue so it can report depths
 * and hand the Prometheus gauge its source.
 */
@Module({
  imports: [JobsModule],
  controllers: [PerformanceController],
  providers: [PerformanceService],
})
export class PerformanceModule {}
