import { Global, Module } from "@nestjs/common";

import { NotificationService } from "./notification.service";

/** Global for the same reason mail is: anything may need to tell somebody something. */
@Global()
@Module({
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
