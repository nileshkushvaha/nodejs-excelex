import { Global, Module } from "@nestjs/common";

import { JobsModule } from "../../jobs/jobs.module";
import { MailService } from "./mail.service";

/**
 * Outgoing mail. Global, because a password reset, a lockout notice and a
 * booking confirmation live in three different modules and each should be
 * able to send without importing anything.
 */
@Global()
@Module({
  imports: [JobsModule],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
