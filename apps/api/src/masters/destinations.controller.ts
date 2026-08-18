import {
  BadRequestException,
  NotFoundException,
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
  UploadedFile,
  UseInterceptors,
  Controller,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { Can } from "../auth/auth.guard";
import { DestinationService } from "./destination.service";
import { DestinationImportService } from "./import/destination-import.service";
import {
  destinationSchema,
  parse,
} from "./masters.schemas";

/**
 * Destinations.
 *
 * Split out of a 1,596-line controller that held every master. The path is
 * unchanged — this is the same routing table in a file somebody can read.
 */
@Controller({ path: "masters", version: "1" })
export class DestinationsController {
  constructor(
    private readonly destinationImport: DestinationImportService,
    private readonly destinations: DestinationService,
  ) {}

  // ── Destinations ─────────────────────────────────────────────────────────
  // Paged in the database rather than the browser. This master runs to a few
  // thousand rows, so sending it whole to filter five of them wastes the trip
  // and leaves the browser unable to count what it was not sent.
  @Get("destinations")
  @Can("destination", "view")
  listDestinations(@Query() query: Record<string, string>) {
    const sortable = ["code", "name", "stateCode", "serviceType", "isActive"] as const;
    const sort = sortable.find((field) => field === query["sort"]) ?? "code";

    return this.destinations.list({
      kind: query["kind"] === "INTERNATIONAL" ? "INTERNATIONAL" : query["kind"] === "DOMESTIC" ? "DOMESTIC" : undefined,
      page: Number(query["page"] ?? 1) || 1,
      pageSize: Number(query["pageSize"] ?? 10) || 10,
      sort,
      direction: query["direction"] === "desc" ? "desc" : "asc",
      code: query["code"],
      name: query["name"],
      countryCode: query["countryCode"],
      stateCode: query["stateCode"],
      serviceType: query["serviceType"],
      status: query["status"],
      search: query["search"],
    });
  }

  /** Unpaged, for the self-referencing branch pickers on the form. */
  @Get("destinations/options")
  @Can("destination", "view")
  destinationOptions() {
    return this.destinations.listAll();
  }

  @Post("destinations")
  @Can("destination", "create")
  createDestination(@Body() body: unknown) {
    return this.destinations.create(parse(destinationSchema, body));
  }

  @Put("destinations/:id")
  @Can("destination", "update")
  @HttpCode(204)
  async updateDestination(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    await this.destinations.update(id, parse(destinationSchema, body));
  }

  @Delete("destinations/:id")
  @Can("destination", "delete")
  @HttpCode(204)
  async deleteDestination(@Param("id", ParseUUIDPipe) id: string) {
    await this.destinations.remove(id);
  }

  @Post("destinations/import")
  @Can("destination", "import")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  importDestinations(
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Query("mode") mode?: string,
  ) {
    if (!file) throw new BadRequestException("Attach a .xlsx or .csv file.");

    const name = file.originalname.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".csv")) {
      throw new BadRequestException("Only .xlsx and .csv files are accepted.");
    }

    return this.destinationImport.run(
      file.buffer,
      file.originalname,
      mode === "commit" ? "commit" : "preview",
    );
  }

  /**
   * Export.
   *
   * Streams every row rather than the current page: the point of an export is
   * to have the whole master, and someone who wanted one page already has it on
   * screen. Values are CSV-escaped, and a leading =, +, - or @ is prefixed with
   * an apostrophe — Excel treats those as formulas, which is how a spreadsheet
   * export becomes a way to run something on the machine that opens it.
   */
  @Get("destinations/export")
  @Can("destination", "export")
  @Header("content-type", "text/csv; charset=utf-8")
  @Header("content-disposition", 'attachment; filename="destinations.csv"')
  async exportDestinations(@Query("kind") kind?: string): Promise<string> {
    const rows = await this.destinations.listAll(
      kind === "INTERNATIONAL" ? "INTERNATIONAL" : kind === "DOMESTIC" ? "DOMESTIC" : undefined,
    );

    const cell = (value: string | null | undefined): string => {
      const text = value ?? "";
      const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
      return `"${guarded.replace(/"/g, '""')}"`;
    };

    const lines = [DestinationImportService.TEMPLATE_HEADERS.join(",")];
    for (const row of rows) {
      lines.push(
        [
          cell(row.code),
          cell(row.name),
          cell(row.kind === "DOMESTIC" ? "Domestic" : "International"),
          cell(row.email),
          cell(row.mobile),
          cell(row.countryCode),
          cell(row.stateCode),
          cell(row.zone?.code),
          cell(row.serviceType),
          cell(row.mainBranch?.code),
          cell(row.manifestBranch?.code),
          cell(row.isActive ? "Active" : "Inactive"),
        ].join(","),
      );
    }

    return `${lines.join("\n")}\n`;
  }

  /** One destination by id, for its edit page. */
  @Get("destinations/:id")
  @Can("destination", "view")
  async destinationById(@Param("id", ParseUUIDPipe) id: string) {
    const row = await this.destinations.byId(id);
    if (!row) throw new NotFoundException("Destination not found.");
    return row;
  }

  @Get("destinations/import/template")
  @Can("destination", "import")
  @Header("content-type", "text/csv; charset=utf-8")
  @Header("content-disposition", 'attachment; filename="destination-import-template.csv"')
  destinationTemplate(): string {
    return `${DestinationImportService.TEMPLATE_HEADERS.join(",")}\nAAM,AMTALA,Domestic,,,IN,WB,,REGULAR,,,Active\n`;
  }
}
