import {
  BadRequestException,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { authorize } from "../auth/ability";
import { MASTERS } from "./import/master-registry";
import { MasterIoService } from "./import/master-io.service";
import { XLSX_CONTENT_TYPE } from "./import/workbook";
import type { MasterSpec } from "./import/master-spec";

/**
 * Import and export, for every master that has a spec.
 *
 * One controller rather than three endpoints per master, which is what makes
 * "every master has import and export" true by construction instead of by
 * somebody remembering. Adding a master to this surface is a spec.
 *
 * The permission cannot be a decorator here, because the resource is not
 * known until the request names the master. It is checked in the handler
 * instead, through the same policy table the decorators read — which is
 * exactly the case the Gate exists for. `authorize` throws a 403 with the
 * permission named, so a refusal says what is missing rather than "no".
 *
 * Mounted under /data rather than beside the masters so a master called
 * "export" could never collide with the export route.
 */
@Controller({ path: "data", version: "1" })
export class DataController {
  constructor(private readonly io: MasterIoService) {}

  /** What can be imported and exported, for a screen that wants to offer it. */
  @Get()
  list() {
    return Object.entries(MASTERS).map(([key, spec]) => ({
      key,
      label: spec.label,
      resource: spec.resource,
      importable: spec.importable !== false,
      columns: spec.columns.map((column) => column.header),
    }));
  }

  @Get(":master/export")
  @Header("content-type", XLSX_CONTENT_TYPE)
  async export(@Param("master") master: string): Promise<StreamableFile> {
    const spec = this.spec(master);
    authorize(spec.resource, "export");

    const file = await this.io.exportWorkbook(spec);
    return new StreamableFile(file, {
      disposition: `attachment; filename="${master}.xlsx"`,
    });
  }

  @Get(":master/import/template")
  @Header("content-type", XLSX_CONTENT_TYPE)
  async template(@Param("master") master: string): Promise<StreamableFile> {
    const spec = this.spec(master);
    // The template is what you fill in to import, so it needs the permission
    // to import — handing the shape of a write to someone who cannot write is
    // an invitation to fill it in and be refused.
    authorize(spec.resource, "import");

    const file = await this.io.templateWorkbook(spec);
    return new StreamableFile(file, {
      disposition: `attachment; filename="${master}-import-template.xlsx"`,
    });
  }

  @Post(":master/import")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async import(
    @Param("master") master: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Query("mode") mode?: string,
  ) {
    const spec = this.spec(master);
    authorize(spec.resource, "import");

    if (!file) throw new BadRequestException("Attach an .xlsx file.");

    const name = file.originalname.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".csv")) {
      throw new BadRequestException("Only .xlsx files are accepted.");
    }

    // Preview unless the caller says otherwise: a mistyped mode should not be
    // the difference between a report and a write.
    return this.io.run(spec, file.buffer, file.originalname, mode === "commit" ? "commit" : "preview");
  }

  private spec(master: string): MasterSpec {
    const spec = MASTERS[master];
    if (!spec) {
      throw new NotFoundException(
        `No master called "${master}". Try one of: ${Object.keys(MASTERS).join(", ")}.`,
      );
    }
    return spec;
  }
}
