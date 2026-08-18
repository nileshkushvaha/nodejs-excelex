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
  UploadedFile,
  UseInterceptors,
  Controller,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { Can } from "../auth/auth.guard";
import { ProductImportService } from "./import/product-import.service";
import { ProductService } from "./product.service";
import {
  parse,
  productSchema,
  productTypeSchema,
} from "./masters.schemas";

/**
 * Products.
 *
 * Split out of a 1,596-line controller that held every master. The path is
 * unchanged — this is the same routing table in a file somebody can read.
 */
@Controller({ path: "masters", version: "1" })
export class ProductsController {
  constructor(
    private readonly productImport: ProductImportService,
    private readonly products: ProductService,
  ) {}

  // ── Products ─────────────────────────────────────────────────────────────
  @Get("product-types")
  @Can("productType", "view")
  listProductTypes() {
    return this.products.listTypes();
  }

  @Post("product-types")
  @Can("productType", "create")
  createProductType(@Body() body: unknown) {
    return this.products.createType(parse(productTypeSchema, body));
  }

  @Get("product-types/:id")
  @Can("productType", "view")
  async productTypeById(@Param("id", ParseUUIDPipe) id: string) {
    const row = await this.products.typeById(id);
    if (!row) throw new BadRequestException("Product type not found.");
    return row;
  }

  @Put("product-types/:id")
  @Can("productType", "update")
  @HttpCode(204)
  async updateProductType(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    await this.products.updateType(id, parse(productTypeSchema, body));
  }

  @Delete("product-types/:id")
  @Can("productType", "delete")
  @HttpCode(204)
  async deleteProductType(@Param("id", ParseUUIDPipe) id: string) {
    await this.products.removeType(id);
  }

  @Get("product-groups")
  @Can("productGroup", "view")
  listProductGroups() {
    return this.products.listGroups();
  }

  @Get("products")
  @Can("product", "view")
  listProducts() {
    return this.products.listProducts();
  }

  @Post("products")
  @Can("product", "create")
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
  @Can("product", "update")
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
  @Can("product", "import")
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
  @Can("product", "import")
  @Header("content-type", "text/csv; charset=utf-8")
  @Header("content-disposition", 'attachment; filename="product-import-template.csv"')
  productTemplate(): string {
    return `${ProductImportService.TEMPLATE_HEADERS.join(",")}\nSFC,Surface,Domestic,Surface,,NDOX,Yes,No,Active\n`;
  }

  @Delete("products/:id")
  @Can("product", "delete")
  @HttpCode(204)
  async deleteProduct(@Param("id", ParseUUIDPipe) id: string) {
    await this.products.deleteProduct(id);
  }
}
