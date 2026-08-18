import {
  BadRequestException,
  Body,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  StreamableFile,
  Controller,
} from "@nestjs/common";

import { Can } from "../auth/auth.guard";
import { ShipperService, type ShipperInput } from "./shipper.service";
import { buildWorkbook, XLSX_CONTENT_TYPE } from "./import/workbook";
import {
  SHIPPER_HEADERS,
  parse,
  shipperSchema,
} from "./masters.schemas";

/**
 * Shippers.
 *
 * Split out of a 1,596-line controller that held every master. The path is
 * unchanged — this is the same routing table in a file somebody can read.
 */
@Controller({ path: "masters", version: "1" })
export class ShippersController {
  constructor(
    private readonly shippers: ShipperService,
  ) {}

  // ── Shippers ─────────────────────────────────────────────────────────────
  @Get("shippers")
  @Can("shipper", "view")
  listShippers(@Query() query: Record<string, string>) {
    return this.shippers.list({
      page: Number(query["page"] ?? 1) || 1,
      pageSize: Number(query["pageSize"] ?? 20) || 20,
      search: query["search"],
      originId: query["originId"],
      serviceCentreId: query["serviceCentreId"],
      status: query["status"],
    });
  }

  @Post("shippers")
  @Can("shipper", "create")
  createShipper(@Body() body: unknown) {
    return this.shippers.create(parse(shipperSchema, body) as ShipperInput);
  }

  // Ahead of "shippers/:id", because Nest matches in declaration order.
  @Get("shippers/export")
  @Can("shipper", "export")
  @Header("content-type", XLSX_CONTENT_TYPE)
  @Header("content-disposition", 'attachment; filename="shippers.xlsx"')
  async exportShippers(@Query() query: Record<string, string>): Promise<StreamableFile> {
    const rows = await this.shippers.listForExport({
      search: query["search"],
      originId: query["originId"],
      serviceCentreId: query["serviceCentreId"],
      status: query["status"],
    });

    const file = await buildWorkbook(
      "Shippers",
      SHIPPER_HEADERS,
      rows.map((row) => [
        row.origin?.code,
        row.code,
        row.name,
        row.contactPerson,
        row.addressLine1,
        row.addressLine2,
        row.pinCode,
        row.city,
        row.stateCode,
        row.telephone1,
        row.telephone2,
        row.fax,
        row.email,
        row.mobile,
        row.industry,
        row.serviceCentre?.name,
        row.gstin,
        row.aadhaar,
        row.pan,
        row.iecNo,
        row.bankAdCode,
        row.bankAccount,
        row.bankIfsc,
        row.firm,
        row.lutNumber,
        row.lutIssueDate,
        row.lutTillDate,
        row.nfei ? "Yes" : "No",
        row.isActive ? "Active" : "In-Active",
      ]),
    );

    return new StreamableFile(file);
  }

  @Get("shippers/:id")
  @Can("shipper", "view")
  async shipperById(@Param("id", ParseUUIDPipe) id: string) {
    const row = await this.shippers.byId(id);
    if (!row) throw new BadRequestException("Shipper not found.");
    return row;
  }

  @Put("shippers/:id")
  @Can("shipper", "update")
  @HttpCode(204)
  async updateShipper(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    await this.shippers.update(id, parse(shipperSchema, body) as ShipperInput);
  }

  @Delete("shippers/:id")
  @Can("shipper", "delete")
  @HttpCode(204)
  async deleteShipper(@Param("id", ParseUUIDPipe) id: string) {
    await this.shippers.remove(id);
  }
}
