import {
  Body,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Controller,
} from "@nestjs/common";

import { Can } from "../auth/auth.guard";
import { AccountGroupService, type AccountGroupInput } from "./account-group.service";
import {
  accountGroupSchema,
  parse,
} from "./masters.schemas";

/**
 * Account groups.
 *
 * Split out of a 1,596-line controller that held every master. The path is
 * unchanged — this is the same routing table in a file somebody can read.
 */
@Controller({ path: "masters", version: "1" })
export class AccountGroupsController {
  constructor(
    private readonly accountGroups: AccountGroupService,
  ) {}

  // ── Account groups ───────────────────────────────────────────────────────
  // The chart of accounts. Under the rate permissions for now, because the
  // people who maintain heads are the people who maintain what they price.
  @Get("account-groups")
  @Can("accountGroup", "view")
  listAccountGroups() {
    return this.accountGroups.list();
  }

  @Post("account-groups")
  @Can("accountGroup", "create")
  createAccountGroup(@Body() body: unknown) {
    return this.accountGroups.create(parse(accountGroupSchema, body) as AccountGroupInput);
  }

  @Put("account-groups/:id")
  @Can("accountGroup", "update")
  @HttpCode(204)
  async updateAccountGroup(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    await this.accountGroups.update(id, parse(accountGroupSchema, body) as AccountGroupInput);
  }

  @Delete("account-groups/:id")
  @Can("accountGroup", "delete")
  @HttpCode(204)
  async deleteAccountGroup(@Param("id", ParseUUIDPipe) id: string) {
    await this.accountGroups.remove(id);
  }
}
