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
import { ConsigneeService, type ConsigneeInput } from "./consignee.service";
import { buildWorkbook, XLSX_CONTENT_TYPE } from "./import/workbook";
import {
  CONSIGNEE_HEADERS,
  consigneeSchema,
  parse,
} from "./masters.schemas";

/**
 * Consignees.
 *
 * Split out of a 1,596-line controller that held every master. The path is
 * unchanged — this is the same routing table in a file somebody can read.
 */
@Controller({ path: "masters", version: "1" })
export class ConsigneesController {
  constructor(
    private readonly consignees: ConsigneeService,
  ) {}

  // ── Consignees ───────────────────────────────────────────────────────────
  // Paged in the database: this is the largest master a courier accumulates,
  // because every address anyone has ever delivered to ends up in it.
  @Get("consignees")
  @Can("consignee", "view")
  listConsignees(@Query() query: Record<string, string>) {
    return this.consignees.list({
      page: Number(query["page"] ?? 1) || 1,
      pageSize: Number(query["pageSize"] ?? 20) || 20,
      search: query["search"],
      destinationId: query["destinationId"],
      serviceCentreId: query["serviceCentreId"],
      status: query["status"],
    });
  }

  @Post("consignees")
  @Can("consignee", "create")
  createConsignee(@Body() body: unknown) {
    return this.consignees.create(parse(consigneeSchema, body) as ConsigneeInput);
  }

  // Ahead of "consignees/:id", because Nest matches in declaration order.
  @Get("consignees/export")
  @Can("consignee", "export")
  @Header("content-type", XLSX_CONTENT_TYPE)
  @Header("content-disposition", 'attachment; filename="consignees.xlsx"')
  async exportConsignees(@Query() query: Record<string, string>): Promise<StreamableFile> {
    const rows = await this.consignees.listForExport({
      search: query["search"],
      destinationId: query["destinationId"],
      serviceCentreId: query["serviceCentreId"],
      status: query["status"],
    });

    const file = await buildWorkbook(
      "Consignees",
      CONSIGNEE_HEADERS,
      rows.map((row) => [
        row.destination?.code,
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
        row.eori,
        row.vat,
        row.isActive ? "Active" : "In-Active",
      ]),
    );

    return new StreamableFile(file);
  }

  @Get("consignees/:id")
  @Can("consignee", "view")
  async consigneeById(@Param("id", ParseUUIDPipe) id: string) {
    const row = await this.consignees.byId(id);
    if (!row) throw new BadRequestException("Consignee not found.");
    return row;
  }

  @Put("consignees/:id")
  @Can("consignee", "update")
  @HttpCode(204)
  async updateConsignee(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    await this.consignees.update(id, parse(consigneeSchema, body) as ConsigneeInput);
  }

  @Delete("consignees/:id")
  @Can("consignee", "delete")
  @HttpCode(204)
  async deleteConsignee(@Param("id", ParseUUIDPipe) id: string) {
    await this.consignees.remove(id);
  }
}
