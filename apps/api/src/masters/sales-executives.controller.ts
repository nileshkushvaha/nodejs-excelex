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
import { SalesExecutiveService } from "./sales-executive.service";
import {
  parse,
  salesExecutiveSchema,
} from "./masters.schemas";

/**
 * Sales executives.
 *
 * Split out of a 1,596-line controller that held every master. The path is
 * unchanged — this is the same routing table in a file somebody can read.
 */
@Controller({ path: "masters", version: "1" })
export class SalesExecutivesController {
  constructor(
    private readonly salesExecutives: SalesExecutiveService,
  ) {}

  // ── Sales executives ─────────────────────────────────────────────────────
  @Get("sales-executives")
  @Can("salesExecutive", "view")
  listSalesExecutives() {
    return this.salesExecutives.list();
  }

  @Post("sales-executives")
  @Can("salesExecutive", "create")
  createSalesExecutive(@Body() body: unknown) {
    return this.salesExecutives.create(parse(salesExecutiveSchema, body));
  }

  @Put("sales-executives/:id")
  @Can("salesExecutive", "update")
  @HttpCode(204)
  async updateSalesExecutive(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    await this.salesExecutives.update(id, parse(salesExecutiveSchema, body));
  }

  @Delete("sales-executives/:id")
  @Can("salesExecutive", "delete")
  @HttpCode(204)
  async deleteSalesExecutive(@Param("id", ParseUUIDPipe) id: string) {
    await this.salesExecutives.remove(id);
  }
}
