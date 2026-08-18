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
import { DestinationImportService } from "./import/destination-import.service";
import { ProductImportService } from "./import/product-import.service";
import { DestinationService } from "./destination.service";
import { ProductService } from "./product.service";
import { ChargeService } from "./charge.service";
import {
  CustomerDetailService,
  type ContactInput,
  type CustomerChargeInput,
  type FuelSurchargeInput,
  type VolumetricInput,
} from "./customer-detail.service";
import { CustomerService, type CustomerInput } from "./customer.service";
import { SalesExecutiveService } from "./sales-executive.service";
import { ServiceCentreService } from "./service-centre.service";
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

/**
 * Code and name, the two columns the legacy screen had. The code is short and
 * upper-cased because it is what appears on rate cards and manifests.
 */
const productTypeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "A product type needs a code.")
    .max(10)
    .regex(/^[A-Za-z0-9-]+$/, "A code may use letters, numbers and hyphens only."),
  name: z.string().trim().min(2, "A product type needs a name.").max(80),
  isActive: z.coerce.boolean().default(true),
});

const chargeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "A charge needs a code.")
    .max(10)
    .regex(/^[A-Za-z0-9-]+$/, "A code may use letters, numbers and hyphens only."),
  name: z.string().trim().min(2, "A charge needs a name.").max(120),
  chargeType: z.enum(["AIRWAYBILL", "EXPENSE", "INCOME", "PURCHASE"]),
  calculationBase: z.enum([
    "ACTUAL_WEIGHT",
    "CHARGE_WEIGHT",
    "COD_AMOUNT",
    "COMMERCIAL",
    "FLAT",
    "FREIGHT",
    "ODA",
    "ODA1",
    "ODA2",
    "ODA3",
    "PIECES",
    "POINT",
    "SHIPMENT_VALUE",
  ]),
  /**
   * Validated as a decimal string, not coerced to a number: the column is exact
   * decimal because it reaches an invoice, and a JavaScript number on the way in
   * would defeat that before it was stored.
   */
  rate: z
    .string()
    .trim()
    .default("0")
    .refine((value) => /^\d{1,8}(\.\d{1,4})?$/.test(value), {
      message: "Rate must be a positive number with up to four decimal places.",
    }),
  applyFuel: z.coerce.boolean(),
  applyTaxOnFuel: z.coerce.boolean(),
  applyTax: z.coerce.boolean(),
  hsnCode: z.string().trim().max(20).nullish(),
  sequence: z.coerce.number().int().min(0).max(9999).default(0),
  applyFuelOnComponents: z.coerce.boolean(),
  isActive: z.coerce.boolean().default(true),
  componentIds: z.array(z.string().uuid()).default([]),
});

/**
 * A customer.
 *
 * Nearly every field is optional because the legacy screen marks only six as
 * required, and a half-known customer created at the counter is worth more
 * than a rejected form. Nullish rather than optional so an emptied field
 * clears the stored value instead of leaving yesterday's.
 */
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);
/** Money and percentages travel as strings and are validated as numerals. */
const decimalText = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d+)?$/, "Enter a number.")
  .nullish()
  .transform((v) => v || null);
const dateText = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date.")
  .nullish()
  .transform((v) => v || null);

const customerSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "A customer needs a code.")
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, "A code may use letters, numbers and hyphens only."),
  name: z.string().trim().min(2, "A customer needs a name.").max(160),
  contactPerson: optionalText(120),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  pinCode: optionalText(12),
  city: optionalText(80),
  stateCode: optionalText(10),
  countryCode: z.string().trim().length(2).default("IN"),
  telephone1: optionalText(40),
  telephone2: optionalText(40),
  fax: optionalText(40),
  email: optionalText(320),
  mobile: optionalText(20),
  billingStateCode: optionalText(10),
  serviceCentreId: z.string().uuid().nullish().transform((v) => v ?? null),
  originId: z.string().uuid().nullish().transform((v) => v ?? null),
  branchId: z.string().uuid().nullish().transform((v) => v ?? null),
  startDate: dateText,
  gstin: optionalText(20),
  aadhaar: optionalText(20),
  aadhaarDob: dateText,
  passportNo: optionalText(20),
  pan: optionalText(20),
  tan: optionalText(20),
  invoiceFormat: optionalText(60),
  customerType: z.enum(["CUSTOMER", "CO_COURIER", "FRANCHISEE"]).default("CUSTOMER"),
  registerType: z.enum(["REGISTERED", "UNREGISTERED", "B2B", "B2C"]).default("REGISTERED"),

  paymentType: z.enum(["CASH", "CHEQUE", "CREDIT", "TOPAY"]).default("CREDIT"),
  billingType: z.enum(["ALL", "DAILY", "WEEKLY", "FORTNIGHTLY", "MONTHLY"]).nullish().transform((v) => v ?? null),
  contractAmount: decimalText,
  creditDays: z.coerce.number().int().min(0).max(365).default(0),
  registrationNo: optionalText(60),
  instructions: optionalText(2000),
  roundRupee: decimalText,
  roundPaisa: decimalText,
  contractHead: optionalText(120),
  ledgerHead: optionalText(120),
  contractOrigin: optionalText(120),
  businessChannel: optionalText(60),
  iecNo: optionalText(30),
  bankAdCode: optionalText(30),
  bankAccount: optionalText(40),
  bankIfsc: optionalText(20),
  firm: z.enum(["GOVT", "NON_GOVT"]).nullish().transform((v) => v ?? null),
  shipperType: z.enum(["INDIVIDUAL", "MSME"]).nullish().transform((v) => v ?? null),
  lutNumber: optionalText(40),
  lutIssueDate: dateText,
  lutTillDate: dateText,
  nfei: z.coerce.boolean().default(false),
  fuelSurcharge: z.coerce.boolean().default(true),
  taxApplicable: z.coerce.boolean().default(true),
  noTariff: z.coerce.boolean().default(false),
  inclusiveTax: z.coerce.boolean().default(false),

  contractNo: optionalText(60),
  contractStartDate: dateText,
  contractEndDate: dateText,
  creditLimit: decimalText,
  securityDeposit: decimalText,
  contractNotes: optionalText(2000),

  salesExecutiveId: z.string().uuid().nullish().transform((v) => v ?? null),
  incentiveType: z.enum(["PERCENTAGE", "INCENTIVE", "FIXED"]).default("PERCENTAGE"),
  incentivePercent: decimalText,
  customerMessage: optionalText(500),
  accountEmail: optionalText(320),
  bestRate: optionalText(120),
  monthlySales: decimalText,
  defaultVendor: optionalText(120),
  area: optionalText(120),
  industry: optionalText(120),
  globalCustomer: z.coerce.boolean().default(false),
  measurementUnit: z.enum(["CENTIMETER", "INCH"]).default("CENTIMETER"),
  geoLocation: optionalText(120),
  disableCustomerOrigin: z.coerce.boolean().default(false),
  enableTaxDutiesPaidBy: z.coerce.boolean().default(false),
  enableAwbNo: z.coerce.boolean().default(false),

  eStatement: z.coerce.boolean().default(false),
  eInvoice: z.coerce.boolean().default(false),
  allowZeroAmount: z.coerce.boolean().default(false),
  isActive: z.coerce.boolean().default(true),
});

const requiredDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date.");
const requiredDecimal = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d+)?$/, "Enter a number.");

const fuelSurchargeSchema = z.object({
  fromDate: requiredDate,
  toDate: requiredDate,
  vendor: optionalText(120),
  productId: z.string().uuid().nullish().transform((v) => v ?? null),
  destinationId: z.string().uuid().nullish().transform((v) => v ?? null),
  service: optionalText(60),
  percentage: requiredDecimal,
});

const customerChargeSchema = z.object({
  chargeId: z.string().uuid(),
  fromDate: requiredDate,
  toDate: requiredDate,
  vendor: optionalText(120),
  service: optionalText(60),
  productId: z.string().uuid().nullish().transform((v) => v ?? null),
  originId: z.string().uuid().nullish().transform((v) => v ?? null),
  destinationId: z.string().uuid().nullish().transform((v) => v ?? null),
  valueType: z.enum(["PERCENTAGE", "AMOUNT"]).default("AMOUNT"),
  value: requiredDecimal,
  minimumValue: decimalText,
});

const volumetricSchema = z.object({
  productId: z.string().uuid().nullish().transform((v) => v ?? null),
  vendor: optionalText(120),
  service: optionalText(60),
  cft: requiredDecimal,
  centimetreDivide: requiredDecimal,
  inchDivide: requiredDecimal,
});

const contactSchema = z.object({
  contactType: z.string().trim().min(1, "Choose a contact type.").max(60),
  fromDate: requiredDate,
  name: z.string().trim().min(2, "A contact needs a name.").max(120),
  designation: optionalText(80),
  email: optionalText(320),
  mobile: z.string().trim().min(6, "A contact needs a mobile number.").max(20),
  landline: optionalText(40),
  extension: optionalText(10),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  addressLine3: optionalText(200),
  pinCode: z.string().trim().min(3, "A pin code is required.").max(12),
  city: optionalText(80),
  stateCode: optionalText(10),
  countryCode: z.string().trim().length(2).default("IN"),
  remark: optionalText(500),
  passportNo: optionalText(20),
  aadhaar: optionalText(20),
  gstin: optionalText(20),
  pan: optionalText(20),
  iecNo: optionalText(30),
  adCode: optionalText(30),
  lutNo: optionalText(40),
  defaultShipper: z.coerce.boolean().default(false),
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

const destinationSchema = z.object({
  kind: z.enum(["DOMESTIC", "INTERNATIONAL"]).default("DOMESTIC"),
  code: z
    .string()
    .trim()
    .min(2, "A destination needs a code.")
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, "A code may use letters, numbers and hyphens only."),
  name: z.string().trim().min(2, "A destination needs a name.").max(120),
  email: z
    .string()
    .trim()
    .max(320)
    .nullish()
    .transform((value) => (value ? value : null))
    .refine((value) => value === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value), {
      message: "That is not a valid email address.",
    }),
  mobile: z.string().trim().max(32).nullish().transform((value) => (value ? value : null)),
  countryCode: z.string().trim().length(2).toUpperCase().default("IN"),
  stateCode: z.string().trim().max(10).nullish().transform((value) => (value ? value.toUpperCase() : null)),
  zoneId: z.string().uuid().nullish().transform((value) => value ?? null),
  serviceType: z.enum(["REGULAR", "METRO", "REMOTE"]).default("REGULAR"),
  mainBranchId: z.string().uuid().nullish().transform((value) => value ?? null),
  manifestBranchId: z.string().uuid().nullish().transform((value) => value ?? null),
  isActive: z.coerce.boolean().default(true),
});

const optional = (max: number) =>
  z.string().trim().max(max).nullish().transform((value) => (value ? value : null));

const counter = z.coerce.number().int().min(0).max(99_999_999).default(0);

const serviceCentreSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "A service centre needs a code.")
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, "A code may use letters, numbers and hyphens only."),
  name: z.string().trim().min(2, "A service centre needs a name.").max(160),
  subName: optional(160),
  addressLine1: optional(200),
  addressLine2: optional(200),
  addressLine3: optional(200),
  addressLine4: optional(200),
  pinCode: optional(16),
  countryCode: z.string().trim().length(2).toUpperCase().default("IN"),
  stateCode: optional(10).transform((value) => (value ? value.toUpperCase() : null)),
  destinationId: z.string().uuid().nullish().transform((value) => value ?? null),
  telephone: optional(32),
  email: optional(320).refine(
    (value) => value === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
    { message: "That is not a valid email address." },
  ),
  gstin: optional(15).refine(
    (value) => value === null || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value.toUpperCase()),
    { message: "That is not a valid GSTIN." },
  ),
  gstTelephone: optional(32),
  pan: optional(10).refine(
    (value) => value === null || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value.toUpperCase()),
    { message: "That is not a valid PAN." },
  ),
  icnNo: optional(40),
  stNo: optional(40),
  terms: z.array(z.string().trim().max(300)).max(10).default([]),
  bankName: optional(120),
  bankAccountNo: optional(40),
  bankAccountName: optional(120),
  bankAddress: optional(200),
  ifsc: optional(11).refine(
    (value) => value === null || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value.toUpperCase()),
    { message: "That is not a valid IFSC code." },
  ),
  micr: optional(9),
  invoicePrefix: optional(20),
  invoiceLastNo: counter,
  invoiceSuffix: optional(20),
  freeFormPrefix: optional(20),
  freeFormLastNo: counter,
  freeFormSuffix: optional(20),
  debitNotePrefix: optional(20),
  debitNoteLastNo: counter,
  debitNoteSuffix: optional(20),
  creditNotePrefix: optional(20),
  creditNoteLastNo: counter,
  creditNoteSuffix: optional(20),
  receiptLastNo: counter,
  isActive: z.coerce.boolean().default(true),
});

const salesExecutiveSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "A sales executive needs a code.")
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, "A code may use letters, numbers and hyphens only."),
  name: z.string().trim().min(2, "A sales executive needs a name.").max(120),
  /**
   * Validated as a decimal string rather than coerced to a number: the column is
   * exact decimal because it multiplies invoice amounts, and passing it through
   * a JavaScript number on the way in would defeat that before it was stored.
   */
  commissionPercent: z
    .string()
    .trim()
    .default("0")
    .refine((value) => /^\d{1,3}(\.\d{1,4})?$/.test(value), {
      message: "Commission must be a number with up to four decimal places.",
    })
    .refine((value) => Number(value) <= 100, {
      message: "Commission cannot exceed 100% — it is a share of the sale.",
    }),
  email: z.string().trim().max(320).nullish().transform((value) => (value ? value : null)),
  mobile: z.string().trim().max(32).nullish().transform((value) => (value ? value : null)),
  isActive: z.coerce.boolean().default(true),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(result.error.issues.map((issue) => issue.message));
  }
  return result.data;
}

/** Nullish is how the schema spells "absent"; the service takes null. */
function toChargeInput(data: z.infer<typeof chargeSchema>) {
  return { ...data, hsnCode: data.hsnCode ?? null };
}

@Controller({ path: "masters", version: "1" })
export class MastersController {
  constructor(
    private readonly reference: ReferenceService,
    private readonly organisation: OrganisationService,
    private readonly products: ProductService,
    private readonly productImport: ProductImportService,
    private readonly zones: ZoneService,
    private readonly destinations: DestinationService,
    private readonly destinationImport: DestinationImportService,
    private readonly serviceCentres: ServiceCentreService,
    private readonly salesExecutives: SalesExecutiveService,
    private readonly charges: ChargeService,
    private readonly customers: CustomerService,
    private readonly customerDetails: CustomerDetailService,
  ) {}

  // ── Customers ────────────────────────────────────────────────────────────
  // Paged in the database. This master runs to thousands of rows per client,
  // so the filters go to SQL rather than to the browser.
  @Get("customers")
  @RequirePermission("masters.customer.view")
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
  @RequirePermission("masters.customer.manage")
  createCustomer(@Body() body: unknown) {
    return this.customers.create(parse(customerSchema, body) as CustomerInput);
  }

  @Get("customers/:id")
  @RequirePermission("masters.customer.view")
  async customerById(@Param("id", ParseUUIDPipe) id: string) {
    const row = await this.customers.byId(id);
    if (!row) throw new BadRequestException("Customer not found.");
    return row;
  }

  @Put("customers/:id")
  @RequirePermission("masters.customer.manage")
  @HttpCode(204)
  async updateCustomer(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    await this.customers.update(id, parse(customerSchema, body) as CustomerInput);
  }

  @Delete("customers/:id")
  @RequirePermission("masters.customer.manage")
  @HttpCode(204)
  async deleteCustomer(@Param("id", ParseUUIDPipe) id: string) {
    await this.customers.remove(id);
  }

  // ── The four lists that hang off a customer ──────────────────────────────
  // Nested under the customer rather than sitting at the top level, because
  // none of these rows means anything without one, and the path is what makes
  // the ownership check impossible to forget.
  @Get("customers/:id/fuel-surcharges")
  @RequirePermission("masters.customer.view")
  listCustomerFuel(@Param("id", ParseUUIDPipe) id: string) {
    return this.customerDetails.listFuelSurcharges(id);
  }

  @Post("customers/:id/fuel-surcharges")
  @RequirePermission("masters.customer.manage")
  createCustomerFuel(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.customerDetails.saveFuelSurcharge(id, null, parse(fuelSurchargeSchema, body) as FuelSurchargeInput);
  }

  @Put("customers/:id/fuel-surcharges/:rowId")
  @RequirePermission("masters.customer.manage")
  @HttpCode(204)
  async updateCustomerFuel(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("rowId", ParseUUIDPipe) rowId: string,
    @Body() body: unknown,
  ) {
    await this.customerDetails.saveFuelSurcharge(id, rowId, parse(fuelSurchargeSchema, body) as FuelSurchargeInput);
  }

  @Delete("customers/:id/fuel-surcharges/:rowId")
  @RequirePermission("masters.customer.manage")
  @HttpCode(204)
  async deleteCustomerFuel(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("rowId", ParseUUIDPipe) rowId: string,
  ) {
    await this.customerDetails.remove("fuel", id, rowId);
  }

  @Get("customers/:id/charges")
  @RequirePermission("masters.customer.view")
  listCustomerCharges(@Param("id", ParseUUIDPipe) id: string) {
    return this.customerDetails.listCharges(id);
  }

  @Post("customers/:id/charges")
  @RequirePermission("masters.customer.manage")
  createCustomerCharge(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.customerDetails.saveCharge(id, null, parse(customerChargeSchema, body) as CustomerChargeInput);
  }

  @Put("customers/:id/charges/:rowId")
  @RequirePermission("masters.customer.manage")
  @HttpCode(204)
  async updateCustomerCharge(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("rowId", ParseUUIDPipe) rowId: string,
    @Body() body: unknown,
  ) {
    await this.customerDetails.saveCharge(id, rowId, parse(customerChargeSchema, body) as CustomerChargeInput);
  }

  @Delete("customers/:id/charges/:rowId")
  @RequirePermission("masters.customer.manage")
  @HttpCode(204)
  async deleteCustomerCharge(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("rowId", ParseUUIDPipe) rowId: string,
  ) {
    await this.customerDetails.remove("charge", id, rowId);
  }

  @Get("customers/:id/volumetrics")
  @RequirePermission("masters.customer.view")
  listCustomerVolumetrics(@Param("id", ParseUUIDPipe) id: string) {
    return this.customerDetails.listVolumetrics(id);
  }

  @Post("customers/:id/volumetrics")
  @RequirePermission("masters.customer.manage")
  createCustomerVolumetric(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.customerDetails.saveVolumetric(id, null, parse(volumetricSchema, body) as VolumetricInput);
  }

  @Put("customers/:id/volumetrics/:rowId")
  @RequirePermission("masters.customer.manage")
  @HttpCode(204)
  async updateCustomerVolumetric(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("rowId", ParseUUIDPipe) rowId: string,
    @Body() body: unknown,
  ) {
    await this.customerDetails.saveVolumetric(id, rowId, parse(volumetricSchema, body) as VolumetricInput);
  }

  @Delete("customers/:id/volumetrics/:rowId")
  @RequirePermission("masters.customer.manage")
  @HttpCode(204)
  async deleteCustomerVolumetric(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("rowId", ParseUUIDPipe) rowId: string,
  ) {
    await this.customerDetails.remove("volumetric", id, rowId);
  }

  @Get("customers/:id/contacts")
  @RequirePermission("masters.customer.view")
  listCustomerContacts(@Param("id", ParseUUIDPipe) id: string) {
    return this.customerDetails.listContacts(id);
  }

  @Post("customers/:id/contacts")
  @RequirePermission("masters.customer.manage")
  createCustomerContact(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.customerDetails.saveContact(id, null, parse(contactSchema, body) as ContactInput);
  }

  @Put("customers/:id/contacts/:rowId")
  @RequirePermission("masters.customer.manage")
  @HttpCode(204)
  async updateCustomerContact(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("rowId", ParseUUIDPipe) rowId: string,
    @Body() body: unknown,
  ) {
    await this.customerDetails.saveContact(id, rowId, parse(contactSchema, body) as ContactInput);
  }

  @Delete("customers/:id/contacts/:rowId")
  @RequirePermission("masters.customer.manage")
  @HttpCode(204)
  async deleteCustomerContact(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("rowId", ParseUUIDPipe) rowId: string,
  ) {
    await this.customerDetails.remove("contact", id, rowId);
  }

  // ── Sales executives ─────────────────────────────────────────────────────
  @Get("sales-executives")
  @RequirePermission("masters.customer.view")
  listSalesExecutives() {
    return this.salesExecutives.list();
  }

  @Post("sales-executives")
  @RequirePermission("masters.customer.manage")
  createSalesExecutive(@Body() body: unknown) {
    return this.salesExecutives.create(parse(salesExecutiveSchema, body));
  }

  @Put("sales-executives/:id")
  @RequirePermission("masters.customer.manage")
  @HttpCode(204)
  async updateSalesExecutive(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    await this.salesExecutives.update(id, parse(salesExecutiveSchema, body));
  }

  @Delete("sales-executives/:id")
  @RequirePermission("masters.customer.manage")
  @HttpCode(204)
  async deleteSalesExecutive(@Param("id", ParseUUIDPipe) id: string) {
    await this.salesExecutives.remove(id);
  }

  // ── Service centres ──────────────────────────────────────────────────────
  // Unpaged: a client runs a handful, not thousands. The moment that stops
  // being true this moves to the paged pattern the destinations use.
  @Get("service-centres")
  @RequirePermission("masters.branch.view")
  listServiceCentres(@Query("search") search?: string) {
    return this.serviceCentres.list(search);
  }

  @Post("service-centres")
  @RequirePermission("masters.branch.manage")
  createServiceCentre(@Body() body: unknown) {
    return this.serviceCentres.create(parse(serviceCentreSchema, body));
  }

  @Put("service-centres/:id")
  @RequirePermission("masters.branch.manage")
  @HttpCode(204)
  async updateServiceCentre(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    await this.serviceCentres.update(id, parse(serviceCentreSchema, body));
  }

  @Delete("service-centres/:id")
  @RequirePermission("masters.branch.manage")
  @HttpCode(204)
  async deleteServiceCentre(@Param("id", ParseUUIDPipe) id: string) {
    await this.serviceCentres.remove(id);
  }

  // ── Destinations ─────────────────────────────────────────────────────────
  // Paged in the database rather than the browser. This master runs to a few
  // thousand rows, so sending it whole to filter five of them wastes the trip
  // and leaves the browser unable to count what it was not sent.
  @Get("destinations")
  @RequirePermission("masters.destination.view")
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
  @RequirePermission("masters.destination.view")
  destinationOptions() {
    return this.destinations.listAll();
  }

  @Post("destinations")
  @RequirePermission("masters.destination.manage")
  createDestination(@Body() body: unknown) {
    return this.destinations.create(parse(destinationSchema, body));
  }

  @Put("destinations/:id")
  @RequirePermission("masters.destination.manage")
  @HttpCode(204)
  async updateDestination(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    await this.destinations.update(id, parse(destinationSchema, body));
  }

  @Delete("destinations/:id")
  @RequirePermission("masters.destination.manage")
  @HttpCode(204)
  async deleteDestination(@Param("id", ParseUUIDPipe) id: string) {
    await this.destinations.remove(id);
  }

  @Post("destinations/import")
  @RequirePermission("masters.destination.manage")
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
  @RequirePermission("masters.destination.view")
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
  @RequirePermission("masters.destination.view")
  async destinationById(@Param("id", ParseUUIDPipe) id: string) {
    const row = await this.destinations.byId(id);
    if (!row) throw new BadRequestException("Destination not found.");
    return row;
  }

  @Get("destinations/import/template")
  @RequirePermission("masters.destination.view")
  @Header("content-type", "text/csv; charset=utf-8")
  @Header("content-disposition", 'attachment; filename="destination-import-template.csv"')
  destinationTemplate(): string {
    return `${DestinationImportService.TEMPLATE_HEADERS.join(",")}\nAAM,AMTALA,Domestic,,,IN,WB,,REGULAR,,,Active\n`;
  }

  // ── Charges ──────────────────────────────────────────────────────────────
  // Under the rate permissions: a charge is what a rate card prices, and the
  // people who set rates are the people who maintain them.
  @Get("charges")
  @RequirePermission("masters.rate.view")
  listCharges() {
    return this.charges.list();
  }

  @Post("charges")
  @RequirePermission("masters.rate.manage")
  createCharge(@Body() body: unknown) {
    return this.charges.create(toChargeInput(parse(chargeSchema, body)));
  }

  @Get("charges/:id")
  @RequirePermission("masters.rate.view")
  async chargeById(@Param("id", ParseUUIDPipe) id: string) {
    const row = await this.charges.byId(id);
    if (!row) throw new BadRequestException("Charge not found.");
    return row;
  }

  @Put("charges/:id")
  @RequirePermission("masters.rate.manage")
  @HttpCode(204)
  async updateCharge(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    await this.charges.update(id, toChargeInput(parse(chargeSchema, body)));
  }

  @Delete("charges/:id")
  @RequirePermission("masters.rate.manage")
  @HttpCode(204)
  async deleteCharge(@Param("id", ParseUUIDPipe) id: string) {
    await this.charges.remove(id);
  }

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

  @Post("product-types")
  @RequirePermission("masters.product.manage")
  createProductType(@Body() body: unknown) {
    return this.products.createType(parse(productTypeSchema, body));
  }

  @Get("product-types/:id")
  @RequirePermission("masters.product.view")
  async productTypeById(@Param("id", ParseUUIDPipe) id: string) {
    const row = await this.products.typeById(id);
    if (!row) throw new BadRequestException("Product type not found.");
    return row;
  }

  @Put("product-types/:id")
  @RequirePermission("masters.product.manage")
  @HttpCode(204)
  async updateProductType(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    await this.products.updateType(id, parse(productTypeSchema, body));
  }

  @Delete("product-types/:id")
  @RequirePermission("masters.product.manage")
  @HttpCode(204)
  async deleteProductType(@Param("id", ParseUUIDPipe) id: string) {
    await this.products.removeType(id);
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
