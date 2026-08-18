import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { z } from "zod";

import { authorize } from "../auth/ability";
import { Can } from "../auth/auth.guard";
import { LOOKUP_KINDS, LookupService, type LookupSlug } from "./lookup.service";
import { PinCodeService, type PinCodeInput } from "./pin-code.service";
import { optionalText, parse } from "./masters.schemas";

const lookupSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "This needs a code.")
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, "A code may use letters, numbers and hyphens only."),
  name: z.string().trim().min(1, "This needs a name.").max(120),
  description: optionalText(300),
  sequence: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.coerce.boolean().default(true),
});

const pinCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, "A pin code is required.")
    .max(12)
    .regex(/^[A-Za-z0-9 -]+$/, "A pin code may use letters, numbers, spaces and hyphens."),
  city: optionalText(80),
  area: optionalText(120),
  stateCode: optionalText(10),
  countryCode: z.string().trim().length(2).default("IN"),
  destinationId: z.string().uuid().nullish().transform((v) => v ?? null),
  zoneId: z.string().uuid().nullish().transform((v) => v ?? null),
  oda: z.coerce.boolean().default(false),
  isActive: z.coerce.boolean().default(true),
});

/**
 * The six short lists, and pin codes.
 *
 * The lists share one controller because they share one table and one
 * service: vendors, industries, areas, content types, instructions and
 * customer groups differ only in what they are called.
 *
 * Their permission cannot be a decorator — the resource is not known until
 * the request names the list — so it is checked in the handler through the
 * same policy table the decorators read.
 */
@Controller({ path: "masters", version: "1" })
export class LookupsController {
  constructor(
    private readonly lookups: LookupService,
    private readonly pinCodes: PinCodeService,
  ) {}

  @Get("lookups/:kind")
  listLookups(@Param("kind") kind: string) {
    return this.lookups.list(this.resolve(kind, "view"));
  }

  @Post("lookups/:kind")
  createLookup(@Param("kind") kind: string, @Body() body: unknown) {
    return this.lookups.create(this.resolve(kind, "create"), parse(lookupSchema, body));
  }

  @Put("lookups/:kind/:id")
  @HttpCode(204)
  async updateLookup(
    @Param("kind") kind: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    await this.lookups.update(this.resolve(kind, "update"), id, parse(lookupSchema, body));
  }

  @Delete("lookups/:kind/:id")
  @HttpCode(204)
  async deleteLookup(@Param("kind") kind: string, @Param("id", ParseUUIDPipe) id: string) {
    await this.lookups.remove(this.resolve(kind, "delete"), id);
  }

  // ── Pin codes ────────────────────────────────────────────────────────────
  @Get("pin-codes")
  @Can("destination", "view")
  listPinCodes(@Query() query: Record<string, string>) {
    return this.pinCodes.list({
      page: Number(query["page"] ?? 1) || 1,
      pageSize: Number(query["pageSize"] ?? 20) || 20,
      search: query["search"],
      destinationId: query["destinationId"],
      zoneId: query["zoneId"],
      status: query["status"],
    });
  }

  @Post("pin-codes")
  @Can("destination", "create")
  createPinCode(@Body() body: unknown) {
    return this.pinCodes.create(parse(pinCodeSchema, body) as PinCodeInput);
  }

  @Get("pin-codes/:id")
  @Can("destination", "view")
  async pinCodeById(@Param("id", ParseUUIDPipe) id: string) {
    const row = await this.pinCodes.byId(id);
    if (!row) throw new NotFoundException("Pin code not found.");
    return row;
  }

  @Put("pin-codes/:id")
  @Can("destination", "update")
  @HttpCode(204)
  async updatePinCode(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    await this.pinCodes.update(id, parse(pinCodeSchema, body) as PinCodeInput);
  }

  @Delete("pin-codes/:id")
  @Can("destination", "delete")
  @HttpCode(204)
  async deletePinCode(@Param("id", ParseUUIDPipe) id: string) {
    await this.pinCodes.remove(id);
  }

  /**
   * Turns a URL segment into a kind, and checks the permission for it.
   *
   * Vendors have their own permission; the rest ride on the master data they
   * describe. Stated here rather than derived, so adding a list is a decision
   * about who may edit it.
   */
  private resolve(kind: string, action: "view" | "create" | "update" | "delete"): string {
    const resolved = LOOKUP_KINDS[kind as LookupSlug];
    if (!resolved) {
      throw new NotFoundException(
        `No list called "${kind}". Try one of: ${Object.keys(LOOKUP_KINDS).join(", ")}.`,
      );
    }

    authorize(kind === "vendors" ? "vendor" : "customer", action);
    return resolved;
  }
}
