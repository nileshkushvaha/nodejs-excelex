import { Module } from "@nestjs/common";

import { SessionsController } from "./sessions.controller";
import { SessionsAdminService } from "./sessions.service";

@Module({ controllers: [SessionsController], providers: [SessionsAdminService] })
export class SessionsModule {}
