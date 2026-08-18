import {
  BadRequestException,
  Get,
  Query,
  Controller,
} from "@nestjs/common";

import { Can } from "../auth/auth.guard";
import { ReferenceService } from "./reference.service";

/**
 * Reference data.
 *
 * Split out of a 1,596-line controller that held every master. The path is
 * unchanged — this is the same routing table in a file somebody can read.
 */
@Controller({ path: "masters", version: "1" })
export class ReferenceController {
  constructor(
    private readonly reference: ReferenceService,
  ) {}

  // ── Reference data ───────────────────────────────────────────────────────
  // No permission required. Every address form in the product needs these, and
  // gating them would mean an operator who can book a shipment cannot name the
  // country it is going to. They are public facts, and read-only to everyone.
  @Get("countries")
  countries() {
    return this.reference.countries();
  }

  @Get("states")
  states(@Query("country") country?: string) {
    const code = (country ?? "IN").trim();
    if (!/^[A-Za-z]{2}$/.test(code)) {
      throw new BadRequestException("Country must be a two-letter ISO code.");
    }
    return this.reference.states(code.toUpperCase());
  }
}
