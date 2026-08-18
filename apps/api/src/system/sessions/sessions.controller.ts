import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";

import { RequirePermission } from "../../auth/auth.guard";
import { readPageRequest } from "../../masters/paged";
import { SessionsAdminService } from "./sessions.service";

/** Every live session in the account, for whoever may manage sessions. */
@Controller({ path: "system/sessions", version: "1" })
export class SessionsController {
  constructor(private readonly sessions: SessionsAdminService) {}

  @Get()
  @RequirePermission("settings.session.manage")
  list(@Query() query: Record<string, string>) {
    return this.sessions.list({ ...readPageRequest(query), userId: query["userId"], search: query["search"] });
  }

  @Get("summary")
  @RequirePermission("settings.session.manage")
  summary() {
    return this.sessions.summary();
  }

  @Post(":id/revoke")
  @RequirePermission("settings.session.manage")
  @HttpCode(200)
  revoke(@Param("id", ParseUUIDPipe) id: string) {
    return this.sessions.revoke(id);
  }

  @Post("users/:userId/revoke-all")
  @RequirePermission("settings.session.manage")
  @HttpCode(200)
  revokeAll(@Param("userId", ParseUUIDPipe) userId: string) {
    return this.sessions.revokeAllForUser(userId);
  }
}
