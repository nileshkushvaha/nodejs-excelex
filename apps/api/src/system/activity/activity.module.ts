import { Module } from "@nestjs/common";

import { ActivityController } from "./activity.controller";
import { ActivityService } from "./activity.service";

/**
 * The activity log. A reader over audit_events and nothing else — there is no
 * writer to export, because nothing outside the trail's own producers may
 * write to it.
 */
@Module({
  controllers: [ActivityController],
  providers: [ActivityService],
})
export class ActivityModule {}
