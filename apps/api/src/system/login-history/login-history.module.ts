import { Global, Module } from "@nestjs/common";

import { LoginHistoryController } from "./login-history.controller";
import { LoginHistoryQueryService } from "./login-history-query.service";
import { LoginHistoryService } from "./login-history.service";

/**
 * Login history: the recorder and the screen that reads it.
 *
 * Global because the recorder is called from AuthService, which lives in the
 * root module's own providers rather than in a feature module of its own.
 * Exporting the recorder globally is what lets sign-in write history without
 * the root module having to know this folder exists.
 */
@Global()
@Module({
  controllers: [LoginHistoryController],
  providers: [LoginHistoryService, LoginHistoryQueryService],
  exports: [LoginHistoryService],
})
export class LoginHistoryModule {}
