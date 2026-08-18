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
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  Controller,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { Can } from "../auth/auth.guard";
import { CustomerDetailService, type ContactInput, type CustomerChargeInput, type FuelSurchargeInput, type VolumetricInput } from "./customer-detail.service";
import { CustomerService, type CustomerInput } from "./customer.service";
import { CustomerImportService } from "./import/customer-import.service";
import { buildWorkbook, XLSX_CONTENT_TYPE } from "./import/workbook";
import {
  contactSchema,
  customerChargeSchema,
  customerSchema,
  fuelSurchargeSchema,
  parse,
  volumetricSchema,
} from "./masters.schemas";

/**
 * Customers.
 *
 * Split out of a 1,596-line controller that held every master. The path is
 * unchanged — this is the same routing table in a file somebody can read.
 */
@Controller({ path: "masters", version: "1" })
export class CustomersController {
  constructor(
    private readonly customerDetails: CustomerDetailService,
    private readonly customerImport: CustomerImportService,
    private readonly customers: CustomerService,
  ) {}

  // ── Customers ────────────────────────────────────────────────────────────
  // Paged in the database. This master runs to thousands of rows per client,
  // so the filters go to SQL rather than to the browser.
  @Get("customers")
  @Can("customer", "view")
  listCustomers(@Query() query: Record<string, string>) {
    return this.customers.list({
      page: Number(query["page"] ?? 1) || 1,
      pageSize: Number(query["pageSize"] ?? 20) || 20,
      search: query["search"],
      branchId: query["branchId"],
      serviceCentreId: query["serviceCentreId"],
      customerType: query["customerType"],
      status: query["status"],
    });
  }

  @Post("customers")
  @Can("customer", "create")
  createCustomer(@Body() body: unknown) {
    return this.customers.create(parse(customerSchema, body) as CustomerInput);
  }

  // Declared before "customers/:id", because Nest matches in declaration
  // order and "export" is not a uuid.
  @Get("customers/export")
  @Can("customer", "export")
  @Header("content-type", XLSX_CONTENT_TYPE)
  @Header("content-disposition", 'attachment; filename="customers.xlsx"')
  async exportCustomers(@Query() query: Record<string, string>): Promise<StreamableFile> {
    const rows = await this.customers.listForExport({
      search: query["search"],
      branchId: query["branchId"],
      serviceCentreId: query["serviceCentreId"],
      customerType: query["customerType"],
      status: query["status"],
    });

    const yesNo = (value: boolean) => (value ? "Yes" : "No");

    // The client's own CustomerMaster headings, in their order, so an export
    // is a valid import: pull the list, edit it in Excel, upload it back.
    const file = await buildWorkbook(
      "Customers",
      CustomerImportService.TEMPLATE_HEADERS,
      rows.map((row) => [
        row.code,
        row.name,
        row.contactPerson,
        row.addressLine1,
        row.addressLine2,
        row.addressLine3,
        row.addressLine4,
        row.pinCode,
        row.telephone1,
        row.telephone2,
        row.email,
        row.mobile,
        row.fax,
        row.stateCode,
        row.serviceCentre?.name,
        row.startDate,
        row.isActive ? "Active" : "In-Active",
        row.origin?.code,
        row.gstin,
        row.aadhaar,
        row.passportNo,
        row.pan,
        row.tan,
        row.invoiceFormat,
        yesNo(row.customerType === "CO_COURIER"),
        row.paymentType,
        row.billingType,
        // Decimals are strings on the way out. Excel will read them as
        // numbers; what matters is that nothing rounds them on the way here.
        row.contractAmount === null ? null : String(row.contractAmount),
        row.creditPercent === null ? null : String(row.creditPercent),
        row.contractHead,
        yesNo(row.fuelSurcharge),
        row.salesExecutive?.code,
        yesNo(row.globalCustomer),
        row.accountEmail,
        row.registerType,
        yesNo(row.taxApplicable),
        yesNo(row.eInvoice),
      ]),
    );

    return new StreamableFile(file);
  }

  @Post("customers/import")
  @Can("customer", "import")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  importCustomers(
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Query("mode") mode?: string,
  ) {
    if (!file) throw new BadRequestException("Attach a .xlsx or .csv file.");

    const name = file.originalname.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".csv")) {
      throw new BadRequestException("Only .xlsx and .csv files are accepted.");
    }

    // Preview unless the caller says otherwise: a mistyped mode should not be
    // the difference between a report and a write.
    return this.customerImport.run(
      file.buffer,
      file.originalname,
      mode === "commit" ? "commit" : "preview",
    );
  }

  @Get("customers/import/template")
  @Can("customer", "import")
  @Header("content-type", XLSX_CONTENT_TYPE)
  @Header("content-disposition", 'attachment; filename="customer-import-template.xlsx"')
  async customerTemplate(): Promise<StreamableFile> {
    // One filled row, because an empty template leaves people guessing what
    // "Register_type" wants and typing something the importer will reject.
    const example = [
      "111146", "TTE TECHNOLOGY INDIA PVT LTD", "Kamal Khanna", "Plot 21, Sector 34", "",
      "Gurugram", "Haryana", "122001", "0124 4000000", "", "accounts@tte.example",
      "9821889052", "", "HR", "EXCELEX EXPRESS LOGISTICS LLP", new Date("2026-01-01T00:00:00Z"),
      "Active", "DEL", "06AAACT1234A1Z5", "", "", "AAACT1234A", "", "", "No", "Credit",
      "Monthly", "500000", "10", "", "Yes", "RAH", "No", "", "Registered", "Yes", "No",
    ];

    const file = await buildWorkbook("Customers", CustomerImportService.TEMPLATE_HEADERS, [example]);
    return new StreamableFile(file);
  }

  @Get("customers/:id")
  @Can("customer", "view")
  async customerById(@Param("id", ParseUUIDPipe) id: string) {
    const row = await this.customers.byId(id);
    if (!row) throw new NotFoundException("Customer not found.");
    return row;
  }

  @Put("customers/:id")
  @Can("customer", "update")
  @HttpCode(204)
  async updateCustomer(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    await this.customers.update(id, parse(customerSchema, body) as CustomerInput);
  }

  @Delete("customers/:id")
  @Can("customer", "delete")
  @HttpCode(204)
  async deleteCustomer(@Param("id", ParseUUIDPipe) id: string) {
    await this.customers.remove(id);
  }

  // ── The four lists that hang off a customer ──────────────────────────────
  // Nested under the customer rather than sitting at the top level, because
  // none of these rows means anything without one, and the path is what makes
  // the ownership check impossible to forget.
  @Get("customers/:id/fuel-surcharges")
  @Can("customer", "view")
  listCustomerFuel(@Param("id", ParseUUIDPipe) id: string) {
    return this.customerDetails.listFuelSurcharges(id);
  }

  @Post("customers/:id/fuel-surcharges")
  @Can("customer", "create")
  createCustomerFuel(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.customerDetails.saveFuelSurcharge(id, null, parse(fuelSurchargeSchema, body) as FuelSurchargeInput);
  }

  @Put("customers/:id/fuel-surcharges/:rowId")
  @Can("customer", "update")
  @HttpCode(204)
  async updateCustomerFuel(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("rowId", ParseUUIDPipe) rowId: string,
    @Body() body: unknown,
  ) {
    await this.customerDetails.saveFuelSurcharge(id, rowId, parse(fuelSurchargeSchema, body) as FuelSurchargeInput);
  }

  @Delete("customers/:id/fuel-surcharges/:rowId")
  @Can("customer", "delete")
  @HttpCode(204)
  async deleteCustomerFuel(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("rowId", ParseUUIDPipe) rowId: string,
  ) {
    await this.customerDetails.remove("fuel", id, rowId);
  }

  @Get("customers/:id/charges")
  @Can("customer", "view")
  listCustomerCharges(@Param("id", ParseUUIDPipe) id: string) {
    return this.customerDetails.listCharges(id);
  }

  @Post("customers/:id/charges")
  @Can("customer", "create")
  createCustomerCharge(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.customerDetails.saveCharge(id, null, parse(customerChargeSchema, body) as CustomerChargeInput);
  }

  @Put("customers/:id/charges/:rowId")
  @Can("customer", "update")
  @HttpCode(204)
  async updateCustomerCharge(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("rowId", ParseUUIDPipe) rowId: string,
    @Body() body: unknown,
  ) {
    await this.customerDetails.saveCharge(id, rowId, parse(customerChargeSchema, body) as CustomerChargeInput);
  }

  @Delete("customers/:id/charges/:rowId")
  @Can("customer", "delete")
  @HttpCode(204)
  async deleteCustomerCharge(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("rowId", ParseUUIDPipe) rowId: string,
  ) {
    await this.customerDetails.remove("charge", id, rowId);
  }

  @Get("customers/:id/volumetrics")
  @Can("customer", "view")
  listCustomerVolumetrics(@Param("id", ParseUUIDPipe) id: string) {
    return this.customerDetails.listVolumetrics(id);
  }

  @Post("customers/:id/volumetrics")
  @Can("customer", "create")
  createCustomerVolumetric(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.customerDetails.saveVolumetric(id, null, parse(volumetricSchema, body) as VolumetricInput);
  }

  @Put("customers/:id/volumetrics/:rowId")
  @Can("customer", "update")
  @HttpCode(204)
  async updateCustomerVolumetric(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("rowId", ParseUUIDPipe) rowId: string,
    @Body() body: unknown,
  ) {
    await this.customerDetails.saveVolumetric(id, rowId, parse(volumetricSchema, body) as VolumetricInput);
  }

  @Delete("customers/:id/volumetrics/:rowId")
  @Can("customer", "delete")
  @HttpCode(204)
  async deleteCustomerVolumetric(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("rowId", ParseUUIDPipe) rowId: string,
  ) {
    await this.customerDetails.remove("volumetric", id, rowId);
  }

  @Get("customers/:id/contacts")
  @Can("customer", "view")
  listCustomerContacts(@Param("id", ParseUUIDPipe) id: string) {
    return this.customerDetails.listContacts(id);
  }

  @Post("customers/:id/contacts")
  @Can("customer", "create")
  createCustomerContact(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.customerDetails.saveContact(id, null, parse(contactSchema, body) as ContactInput);
  }

  @Put("customers/:id/contacts/:rowId")
  @Can("customer", "update")
  @HttpCode(204)
  async updateCustomerContact(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("rowId", ParseUUIDPipe) rowId: string,
    @Body() body: unknown,
  ) {
    await this.customerDetails.saveContact(id, rowId, parse(contactSchema, body) as ContactInput);
  }

  @Delete("customers/:id/contacts/:rowId")
  @Can("customer", "delete")
  @HttpCode(204)
  async deleteCustomerContact(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("rowId", ParseUUIDPipe) rowId: string,
  ) {
    await this.customerDetails.remove("contact", id, rowId);
  }
}
