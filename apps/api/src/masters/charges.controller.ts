import {
  BadRequestException,
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
import { ChargeService } from "./charge.service";
import {
  chargeSchema,
  parse,
  toChargeInput,
} from "./masters.schemas";

/**
 * Charges.
 *
 * Split out of a 1,596-line controller that held every master. The path is
 * unchanged — this is the same routing table in a file somebody can read.
 */
@Controller({ path: "masters", version: "1" })
export class ChargesController {
  constructor(
    private readonly charges: ChargeService,
  ) {}

  // ── Charges ──────────────────────────────────────────────────────────────
  // Under the rate permissions: a charge is what a rate card prices, and the
  // people who set rates are the people who maintain them.
  @Get("charges")
  @Can("charge", "view")
  listCharges() {
    return this.charges.list();
  }

  @Post("charges")
  @Can("charge", "create")
  createCharge(@Body() body: unknown) {
    return this.charges.create(toChargeInput(parse(chargeSchema, body)));
  }

  @Get("charges/:id")
  @Can("charge", "view")
  async chargeById(@Param("id", ParseUUIDPipe) id: string) {
    const row = await this.charges.byId(id);
    if (!row) throw new BadRequestException("Charge not found.");
    return row;
  }

  @Put("charges/:id")
  @Can("charge", "update")
  @HttpCode(204)
  async updateCharge(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    await this.charges.update(id, toChargeInput(parse(chargeSchema, body)));
  }

  @Delete("charges/:id")
  @Can("charge", "delete")
  @HttpCode(204)
  async deleteCharge(@Param("id", ParseUUIDPipe) id: string) {
    await this.charges.remove(id);
  }
}
