import { Module } from "@nestjs/common";

import { JobsModule } from "../jobs/jobs.module";
import { ActivityModule } from "./activity/activity.module";
import { CacheModule } from "./cache/cache.module";
import { ExceptionsModule } from "./exceptions/exceptions.module";
import { LoginHistoryModule } from "./login-history/login-history.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PerformanceModule } from "./performance/performance.module";
import { QueueModule } from "./queue/queue.module";
import { SchedulerModule } from "./scheduler/scheduler.module";

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
  imports: [
    JobsModule,
    QueueModule,
    SchedulerModule,
    CacheModule,
    ActivityModule,
    LoginHistoryModule,
    NotificationsModule,
    ExceptionsModule,
    PerformanceModule,
  ],
})
export class SystemModule {}
