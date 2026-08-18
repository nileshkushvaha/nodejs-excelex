import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { z } from "zod";

import { Can } from "../auth/auth.guard";
import { parse } from "./masters.schemas";
import { RateImportService } from "./import/rate-import.service";
import { buildWorkbook, XLSX_CONTENT_TYPE } from "./import/workbook";
import { RateCopyService, type RateCopyRequest } from "./rate-copy.service";
import { RateService } from "./rate.service";

const lane = z.object({
  customerId: z.string().uuid().nullish(),
  originId: z.string().uuid().nullish(),
  destinationId: z.string().uuid().nullish(),
  productId: z.string().uuid().nullish(),
  zoneId: z.string().uuid().nullish(),
  vendor: z.string().trim().max(120).nullish(),
  service: z.string().trim().max(60).nullish(),
  countryCode: z.string().trim().max(2).nullish(),
});

const rateCopySchema = z.object({
  from: lane.extend({ effectiveFrom: z.string().trim().nullish() }),
  // The target date is the one thing a copy must state: every copied rate
  // takes effect from it, and defaulting it to today would silently reprice
  // work already booked.
  to: lane.extend({
    effectiveFrom: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date the copy takes effect."),
  }),
  percentageIncrease: z.string().trim().default("0"),
  rounding: z.enum(["NONE", "NEAREST", "UP", "DOWN"]).default("NONE"),
});

/**
 * Rates.
 *
 * Import is the way rates arrive — a courier's tariff is thousands of lines
 * maintained in a spreadsheet by the person who negotiated it, and typing
 * them into a form would be a worse copy of a file that already exists. The
 * screens exist to read, search and retire them.
 */
@Controller({ path: "masters", version: "1" })
export class RatesController {
  constructor(
    private readonly rates: RateService,
    private readonly rateImport: RateImportService,
    private readonly rateCopy: RateCopyService,
  ) {}

  @Get("rates")
  @Can("zone", "view")
  list(@Query() query: Record<string, string>) {
    return this.rates.list({
      page: Number(query["page"] ?? 1) || 1,
      pageSize: Number(query["pageSize"] ?? 20) || 20,
      customerId: query["customerId"],
      productId: query["productId"],
      originId: query["originId"],
      destinationId: query["destinationId"],
      on: query["on"],
      status: query["status"],
    });
  }

  // Ahead of "rates/:id", because Nest matches in declaration order.
  @Get("rates/export")
  @Can("zone", "export")
  @Header("content-type", XLSX_CONTENT_TYPE)
  @Header("content-disposition", 'attachment; filename="rates.xlsx"')
  async export(@Query() query: Record<string, string>): Promise<StreamableFile> {
    const rows = await this.rates.listForExport({
      customerId: query["customerId"],
      productId: query["productId"],
      originId: query["originId"],
      destinationId: query["destinationId"],
      status: query["status"],
    });

    // One row per line, with the key repeated — the shape their own export
    // has, so a file taken out of here goes back into either system.
    const file = await buildWorkbook("Rates", RateImportService.TEMPLATE_HEADERS, rows);
    return new StreamableFile(file);
  }

  @Get("rates/import/template")
  @Can("zone", "import")
  @Header("content-type", XLSX_CONTENT_TYPE)
  @Header("content-disposition", 'attachment; filename="rate-import-template.xlsx"')
  async template(): Promise<StreamableFile> {
    const example = [
      "BOM", "111146", "01-Jan-2026", "DHL", "DOX", "EXPRESS", "Z1", "IN", "DEL",
      "INITIAL", "0.500", "850", "50", "Kgs", "3",
    ];
    const file = await buildWorkbook("Rates", RateImportService.TEMPLATE_HEADERS, [example]);
    return new StreamableFile(file);
  }

  @Post("rates/import")
  @Can("zone", "import")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
  import(
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Query("mode") mode?: string,
  ) {
    if (!file) throw new BadRequestException("Attach an .xlsx file.");

    const name = file.originalname.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".csv")) {
      throw new BadRequestException("Only .xlsx files are accepted.");
    }

    // Preview unless the caller says otherwise: a mistyped mode should not be
    // the difference between a report and thousands of written rates.
    return this.rateImport.run(file.buffer, file.originalname, mode === "commit" ? "commit" : "preview");
  }

  @Post("rates/copy")
  @Can("zone", "create")
  copy(@Body() body: unknown, @Query("mode") mode?: string) {
    // Preview unless the caller says otherwise. This writes hundreds of
    // rates in one call, and a mistyped mode should not be the difference
    // between a report and a repriced tariff.
    return this.rateCopy.run(
      parse(rateCopySchema, body) as unknown as RateCopyRequest,
      mode === "commit" ? "commit" : "preview",
    );
  }

  @Get("rates/:id")
  @Can("zone", "view")
  async byId(@Param("id", ParseUUIDPipe) id: string) {
    const row = await this.rates.byId(id);
    if (!row) throw new BadRequestException("Rate not found.");
    return row;
  }

  @Delete("rates/:id")
  @Can("zone", "delete")
  @HttpCode(204)
  async remove(@Param("id", ParseUUIDPipe) id: string) {
    await this.rates.remove(id);
  }
}
