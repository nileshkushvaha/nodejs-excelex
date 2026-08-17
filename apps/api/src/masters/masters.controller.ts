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
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { z } from "zod";

import { RequirePermission } from "../auth/auth.guard";
import { OrganisationService } from "./organisation.service";
import { ProductImportService } from "./import/product-import.service";
import { ProductService } from "./product.service";
import { ZoneService } from "./zone.service";
import { ReferenceService } from "./reference.service";

const departmentSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "A department needs a code.")
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, "A code may use letters, numbers and hyphens only."),
  name: z.string().trim().min(2, "A department needs a name.").max(80),
  description: z.string().trim().max(300).nullish(),
  isActive: z.coerce.boolean().default(true),
});

const designationSchema = departmentSchema.extend({
  departmentId: z.string().uuid().nullish(),
  /** Seniority, low to high. Bounded so the ordering stays meaningful. */
  level: z.coerce.number().int().min(0).max(1000).default(0),
});

const productSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "A product needs a code.")
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, "A code may use letters, numbers and hyphens only."),
  name: z.string().trim().min(2, "A product needs a name.").max(120),
  productTypeId: z.string().uuid().nullish(),
  productGroupId: z.string().uuid().nullish(),
  service: z.string().trim().max(40).nullish(),
  contentKind: z.enum(["DOX", "NDOX"]),
  fuelCharge: z.coerce.boolean(),
  gstReverse: z.coerce.boolean(),
  isActive: z.coerce.boolean(),
});

const zoneSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "A zone needs a code.")
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, "A code may use letters, numbers and hyphens only."),
  name: z.string().trim().min(2, "A zone needs a name.").max(80),
  isActive: z.coerce.boolean().default(true),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(result.error.issues.map((issue) => issue.message));
  }
  return result.data;
}

@Controller({ path: "masters", version: "1" })
export class MastersController {
  constructor(
    private readonly reference: ReferenceService,
    private readonly organisation: OrganisationService,
    private readonly products: ProductService,
    private readonly productImport: ProductImportService,
    private readonly zones: ZoneService,
  ) {}

  // ── Zones ────────────────────────────────────────────────────────────────
  @Get("zones")
  @RequirePermission("masters.rate.view")
  listZones() {
    return this.zones.list();
  }

  @Post("zones")
  @RequirePermission("masters.rate.manage")
  createZone(@Body() body: unknown) {
    return this.zones.create(parse(zoneSchema, body));
  }

  @Put("zones/:id")
  @RequirePermission("masters.rate.manage")
  @HttpCode(204)
  async updateZone(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    await this.zones.update(id, parse(zoneSchema, body));
  }

  @Delete("zones/:id")
  @RequirePermission("masters.rate.manage")
  @HttpCode(204)
  async deleteZone(@Param("id", ParseUUIDPipe) id: string) {
    await this.zones.remove(id);
  }

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

  // ── Products ─────────────────────────────────────────────────────────────
  @Get("product-types")
  @RequirePermission("masters.product.view")
  listProductTypes() {
    return this.products.listTypes();
  }

  @Get("product-groups")
  @RequirePermission("masters.product.view")
  listProductGroups() {
    return this.products.listGroups();
  }

  @Get("products")
  @RequirePermission("masters.product.view")
  listProducts() {
    return this.products.listProducts();
  }

  @Post("products")
  @RequirePermission("masters.product.manage")
  createProduct(@Body() body: unknown) {
    const data = parse(productSchema, body);
    return this.products.createProduct({
      ...data,
      productTypeId: data.productTypeId ?? null,
      productGroupId: data.productGroupId ?? null,
      service: data.service ?? null,
    });
  }

  @Put("products/:id")
  @RequirePermission("masters.product.manage")
  @HttpCode(204)
  async updateProduct(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    const data = parse(productSchema, body);
    await this.products.updateProduct(id, {
      ...data,
      productTypeId: data.productTypeId ?? null,
      productGroupId: data.productGroupId ?? null,
      service: data.service ?? null,
    });
  }

  /**
   * Preview or commit a spreadsheet import.
   *
   * The mode is explicit rather than inferred: an import that writes because a
   * query parameter was omitted is the kind of default nobody wants to discover
   * afterwards. Preview is the default for the same reason.
   */
  @Post("products/import")
  @RequirePermission("masters.product.manage")
  @UseInterceptors(
    FileInterceptor("file", {
      // Held in memory rather than written to disk: nothing here needs to
      // outlive the request, and a temp file is one more thing to clean up and
      // one more place a client's data can be left behind.
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  importProducts(
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Query("mode") mode?: string,
  ) {
    if (!file) throw new BadRequestException("Attach a .xlsx or .csv file.");

    const name = file.originalname.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".csv")) {
      throw new BadRequestException("Only .xlsx and .csv files are accepted.");
    }

    return this.productImport.run(
      file.buffer,
      file.originalname,
      mode === "commit" ? "commit" : "preview",
    );
  }

  /** A blank file with the accepted headings, so nobody has to guess them. */
  @Get("products/import/template")
  @RequirePermission("masters.product.view")
  @Header("content-type", "text/csv; charset=utf-8")
  @Header("content-disposition", 'attachment; filename="product-import-template.csv"')
  productTemplate(): string {
    return `${ProductImportService.TEMPLATE_HEADERS.join(",")}\nSFC,Surface,Domestic,Surface,,NDOX,Yes,No,Active\n`;
  }

  @Delete("products/:id")
  @RequirePermission("masters.product.manage")
  @HttpCode(204)
  async deleteProduct(@Param("id", ParseUUIDPipe) id: string) {
    await this.products.deleteProduct(id);
  }

  // ── Departments ──────────────────────────────────────────────────────────
  @Get("departments")
  @RequirePermission("masters.organisation.view")
  listDepartments() {
    return this.organisation.listDepartments();
  }

  @Post("departments")
  @RequirePermission("masters.organisation.manage")
  createDepartment(@Body() body: unknown) {
    const data = parse(departmentSchema, body);
    return this.organisation.createDepartment({ ...data, description: data.description ?? null });
  }

  @Put("departments/:id")
  @RequirePermission("masters.organisation.manage")
  @HttpCode(204)
  async updateDepartment(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    const data = parse(departmentSchema, body);
    await this.organisation.updateDepartment(id, { ...data, description: data.description ?? null });
  }

  @Delete("departments/:id")
  @RequirePermission("masters.organisation.manage")
  @HttpCode(204)
  async deleteDepartment(@Param("id", ParseUUIDPipe) id: string) {
    await this.organisation.deleteDepartment(id);
  }

  // ── Designations ─────────────────────────────────────────────────────────
  @Get("designations")
  @RequirePermission("masters.organisation.view")
  listDesignations() {
    return this.organisation.listDesignations();
  }

  @Post("designations")
  @RequirePermission("masters.organisation.manage")
  createDesignation(@Body() body: unknown) {
    const data = parse(designationSchema, body);
    return this.organisation.createDesignation({
      ...data,
      description: data.description ?? null,
      departmentId: data.departmentId ?? null,
    });
  }

  @Put("designations/:id")
  @RequirePermission("masters.organisation.manage")
  @HttpCode(204)
  async updateDesignation(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    const data = parse(designationSchema, body);
    await this.organisation.updateDesignation(id, {
      ...data,
      description: data.description ?? null,
      departmentId: data.departmentId ?? null,
    });
  }

  @Delete("designations/:id")
  @RequirePermission("masters.organisation.manage")
  @HttpCode(204)
  async deleteDesignation(@Param("id", ParseUUIDPipe) id: string) {
    await this.organisation.deleteDesignation(id);
  }
}
