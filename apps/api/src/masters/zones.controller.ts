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
import { ZoneService } from "./zone.service";
import {
  parse,
  zoneSchema,
} from "./masters.schemas";

/**
 * Zones.
 *
 * Split out of a 1,596-line controller that held every master. The path is
 * unchanged — this is the same routing table in a file somebody can read.
 */
@Controller({ path: "masters", version: "1" })
export class ZonesController {
  constructor(
    private readonly zones: ZoneService,
  ) {}

  // ── Zones ────────────────────────────────────────────────────────────────
  @Get("zones")
  @Can("zone", "view")
  listZones() {
    return this.zones.list();
  }

  @Post("zones")
  @Can("zone", "create")
  createZone(@Body() body: unknown) {
    return this.zones.create(parse(zoneSchema, body));
  }

  @Put("zones/:id")
  @Can("zone", "update")
  @HttpCode(204)
  async updateZone(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    await this.zones.update(id, parse(zoneSchema, body));
  }

  @Delete("zones/:id")
  @Can("zone", "delete")
  @HttpCode(204)
  async deleteZone(@Param("id", ParseUUIDPipe) id: string) {
    await this.zones.remove(id);
  }
}
