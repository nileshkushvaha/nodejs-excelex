import {
  Body,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Controller,
} from "@nestjs/common";

import { Can } from "../auth/auth.guard";
import { ServiceCentreService } from "./service-centre.service";
import {
  parse,
  serviceCentreSchema,
} from "./masters.schemas";

/**
 * Service centres.
 *
 * Split out of a 1,596-line controller that held every master. The path is
 * unchanged — this is the same routing table in a file somebody can read.
 */
@Controller({ path: "masters", version: "1" })
export class ServiceCentresController {
  constructor(
    private readonly serviceCentres: ServiceCentreService,
  ) {}

  // ── Service centres ──────────────────────────────────────────────────────
  // Unpaged: a client runs a handful, not thousands. The moment that stops
  // being true this moves to the paged pattern the destinations use.
  @Get("service-centres")
  @Can("serviceCentre", "view")
  listServiceCentres(@Query("search") search?: string) {
    return this.serviceCentres.list(search);
  }

  @Post("service-centres")
  @Can("serviceCentre", "create")
  createServiceCentre(@Body() body: unknown) {
    return this.serviceCentres.create(parse(serviceCentreSchema, body));
  }

  @Put("service-centres/:id")
  @Can("serviceCentre", "update")
  @HttpCode(204)
  async updateServiceCentre(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    await this.serviceCentres.update(id, parse(serviceCentreSchema, body));
  }

  @Delete("service-centres/:id")
  @Can("serviceCentre", "delete")
  @HttpCode(204)
  async deleteServiceCentre(@Param("id", ParseUUIDPipe) id: string) {
    await this.serviceCentres.remove(id);
  }
}
