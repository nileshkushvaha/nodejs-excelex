import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

/**
 * Every master's request schema, and the two helpers they share.
 *
 * Extracted from the controller when it was split, so the eleven controllers
 * that replaced it validate against one definition rather than eleven copies
 * that drift. Each schema still belongs, eventually, beside the master it
 * describes; this is the halfway house that made an 88-route split provable
 * in one step instead of two risky ones.
 */
export const departmentSchema = z.object({
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

export const designationSchema = departmentSchema.extend({
  departmentId: z.string().uuid().nullish(),
  /** Seniority, low to high. Bounded so the ordering stays meaningful. */
  level: z.coerce.number().int().min(0).max(1000).default(0),
});

export const productSchema = z.object({
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
export const productTypeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "A product type needs a code.")
    .max(10)
    .regex(/^[A-Za-z0-9-]+$/, "A code may use letters, numbers and hyphens only."),
  name: z.string().trim().min(2, "A product type needs a name.").max(80),
  isActive: z.coerce.boolean().default(true),
});

export const chargeSchema = z.object({
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
export const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);
/** Money and percentages travel as strings and are validated as numerals. */
export const decimalText = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d+)?$/, "Enter a number.")
  .nullish()
  .transform((v) => v || null);
export const dateText = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date.")
  .nullish()
  .transform((v) => v || null);

export const customerSchema = z.object({
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

export const requiredDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date.");
export const requiredDecimal = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d+)?$/, "Enter a number.");

export const fuelSurchargeSchema = z.object({
  fromDate: requiredDate,
  toDate: requiredDate,
  vendor: optionalText(120),
  productId: z.string().uuid().nullish().transform((v) => v ?? null),
  destinationId: z.string().uuid().nullish().transform((v) => v ?? null),
  service: optionalText(60),
  percentage: requiredDecimal,
});

export const customerChargeSchema = z.object({
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

export const volumetricSchema = z.object({
  productId: z.string().uuid().nullish().transform((v) => v ?? null),
  vendor: optionalText(120),
  service: optionalText(60),
  cft: requiredDecimal,
  centimetreDivide: requiredDecimal,
  inchDivide: requiredDecimal,
});

export const contactSchema = z.object({
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

/**
 * A consignee.
 *
 * Only the code and the name are required. The rest of the screen is an
 * address book entry filled in as it becomes known — a delivery booked today
 * against a phone number and nothing else is still a delivery.
 */
/** The export and import share one column list, so they cannot drift apart. */
export const CONSIGNEE_HEADERS = [
  "Destination Code",
  "Consignee Code",
  "Consignee Name",
  "Contact Person",
  "Address1",
  "Address2",
  "Pin Code",
  "City",
  "State",
  "Telephone1",
  "Telephone2",
  "Fax",
  "Email",
  "Mobile",
  "Industry",
  "Service Center",
  "EORI",
  "VAT",
  "Status",
] as const;

/** The shipper list and its export share one column set. */
export const SHIPPER_HEADERS = [
  "Origin Code",
  "Shipper Code",
  "Shipper Name",
  "Contact Person",
  "Address1",
  "Address2",
  "Pin Code",
  "City",
  "State",
  "Telephone1",
  "Telephone2",
  "Fax",
  "Email",
  "Mobile No",
  "Industry",
  "Service Center",
  "GST No",
  "Aadhar No",
  "PAN No",
  "IEC No",
  "Bank AD Code",
  "Bank Account",
  "Bank IFSC",
  "Firm",
  "LUT Number",
  "LUT Issue Date",
  "LUT Till Date",
  "NFEI",
  "Status",
] as const;

export const shipperSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "A shipper needs a code.")
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, "A code may use letters, numbers and hyphens only."),
  name: z.string().trim().min(1, "A shipper needs a name.").max(160),
  originId: z.string().uuid().nullish().transform((v) => v ?? null),
  serviceCentreId: z.string().uuid().nullish().transform((v) => v ?? null),
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
  industry: optionalText(120),
  gstin: optionalText(20),
  aadhaar: optionalText(20),
  pan: optionalText(20),
  iecNo: optionalText(30),
  bankAdCode: optionalText(30),
  bankAccount: optionalText(40),
  bankIfsc: optionalText(20),
  firm: z.enum(["GOVT", "NON_GOVT"]).nullish().transform((v) => v ?? null),
  lutNumber: optionalText(40),
  lutIssueDate: dateText,
  lutTillDate: dateText,
  nfei: z.coerce.boolean().default(false),
  isActive: z.coerce.boolean().default(true),
});

export const accountGroupSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "A group needs a code.")
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, "A code may use letters, numbers and hyphens only."),
  name: z.string().trim().min(2, "A group needs a name.").max(120),
  parentId: z.string().uuid().nullish().transform((v) => v ?? null),
  isActive: z.coerce.boolean().default(true),
});

export const consigneeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "A consignee needs a code.")
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, "A code may use letters, numbers and hyphens only."),
  name: z.string().trim().min(1, "A consignee needs a name.").max(160),
  destinationId: z.string().uuid().nullish().transform((v) => v ?? null),
  serviceCentreId: z.string().uuid().nullish().transform((v) => v ?? null),
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
  industry: optionalText(120),
  eori: optionalText(30),
  vat: optionalText(30),
  isActive: z.coerce.boolean().default(true),
});

export const zoneSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "A zone needs a code.")
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, "A code may use letters, numbers and hyphens only."),
  name: z.string().trim().min(2, "A zone needs a name.").max(80),
  isActive: z.coerce.boolean().default(true),
});

export const destinationSchema = z.object({
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

export const optional = (max: number) =>
  z.string().trim().max(max).nullish().transform((value) => (value ? value : null));

export const counter = z.coerce.number().int().min(0).max(99_999_999).default(0);

export const serviceCentreSchema = z.object({
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

export const salesExecutiveSchema = z.object({
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

export function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(result.error.issues.map((issue) => issue.message));
  }
  return result.data;
}

/** Nullish is how the schema spells "absent"; the service takes null. */
export function toChargeInput(data: z.infer<typeof chargeSchema>) {
  return { ...data, hsnCode: data.hsnCode ?? null };
}
