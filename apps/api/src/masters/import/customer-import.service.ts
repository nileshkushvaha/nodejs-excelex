import { Injectable } from "@nestjs/common";

import { requireRequestContext } from "../../core/context/request-context";
import { PrismaService } from "../../core/database/prisma.service";
import { normaliseHeader, parseSpreadsheet, type ImportReport, type RowOutcome } from "./spreadsheet";

/**
 * Spreadsheet import for the customer master.
 *
 * The same two-phase contract as the other imports: preview reports what would
 * change without writing, and a commit with any failing row writes nothing.
 * Partial import is the worst outcome available — the master is half-applied,
 * the corrected file re-applies the good rows as updates, and afterwards
 * nobody can say what state it is in.
 *
 * The customer table has ninety columns and this reads twenty-four of them.
 * That is the deliberate part: an import is for the columns a migration or a
 * bulk correction actually carries — identity, contact, tax registration and
 * the billing terms. Rates, contacts and volumetrics are their own lists with
 * their own dates, and folding them into one wide row would make a file nobody
 * can produce.
 */

/**
 * Accepted spellings for each column, normalised.
 *
 * Taken from the client's own two files rather than invented: CustomerMaster
 * is the shape their staff fill in, Customerlist is what the legacy system
 * exports. Both are listed, so a file exported from the old system on Monday
 * imports here on Tuesday without anyone renaming a column.
 */
const COLUMNS = {
  code: ["customercode", "code"],
  name: ["customername", "name"],
  contactPerson: ["contactperson", "contact", "contactperson"],
  addressLine1: ["address1", "addressline1", "address"],
  addressLine2: ["address2", "addressline2"],
  addressLine3: ["address3", "addressline3"],
  addressLine4: ["address4", "addressline4"],
  pinCode: ["pincode", "pin", "postcode"],
  city: ["city"],
  stateCode: ["state", "statecode"],
  billingStateCode: ["billingstate", "customerbillingstate", "billingstatecode"],
  telephone1: ["telno1", "telephone1", "customertel1", "phone", "telephone"],
  telephone2: ["telno2", "telephone2", "customertel2"],
  mobile: ["mobile", "mobileno", "customermobile", "cell"],
  fax: ["faxno", "fax", "customerfax"],
  email: ["emailid", "email", "customeremail"],
  accountEmail: ["customeremailacct", "accountemail"],
  // The legacy export puts the branch code in "branch code" and the service
  // centre's name in "branch name", which is what their screens show too.
  serviceCentre: ["servicecentre", "servicecenter", "branchname"],
  branch: ["branch", "branchcode"],
  origin: ["origin"],
  gstin: ["gstno", "gstin", "gst"],
  aadhaar: ["aadharno", "aadhaarno", "aadhar", "aadhaar"],
  passportNo: ["passportno", "passport"],
  pan: ["panno", "pan"],
  tan: ["tanno", "tan"],
  invoiceFormat: ["invoiceformat"],
  coCourier: ["cocourier"],
  customerType: ["customertype", "type"],
  registerType: ["registertype", "registrationtype"],
  paymentType: ["paymenttype", "payment"],
  billingType: ["billingtype", "billingcycle"],
  contractAmount: ["contractamount"],
  creditDays: ["creditdays"],
  creditLimit: ["creditlimit"],
  creditPercent: ["creditpercentage", "creditpercent"],
  contractHead: ["contracthead"],
  fuelSurcharge: ["fuelsurcharge", "fuel"],
  taxApplicable: ["tax", "taxapplicable"],
  eInvoice: ["einvoice", "einvoicing"],
  globalCustomer: ["globalcustomer"],
  startDate: ["startdate", "custstartdate"],
  salesExecutive: ["salesexecutive", "salesex", "salesexcode", "execcode", "execname"],
  isActive: ["customerstatus", "status", "active", "isactive"],
} as const;

/**
 * Columns that are read to be refused.
 *
 * The legacy sheet carries portal logins in plain text. Importing them would
 * mean this system storing a password it can read, which is the one thing a
 * password store must never do — and a customer portal account is a user with
 * a hashed credential, not a column on the customer row. The file is not
 * rejected over it; the columns are ignored and the row is flagged so nobody
 * believes the logins came across.
 */
const REFUSED_COLUMNS = ["customeruser", "customerpassword", "password"] as const;

function pick(row: Record<string, string>, names: readonly string[]): string {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

function parseBoolean(value: string): boolean | undefined {
  // Punctuation is stripped, not just case: the client's export writes
  // "In-Active", which read as unrecognised and fell back to the default —
  // quietly importing every closed account as open.
  const text = value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!text) return undefined;
  if (["y", "yes", "true", "1", "active", "on"].includes(text)) return true;
  if (["n", "no", "false", "0", "inactive", "off", "closed"].includes(text)) return false;
  return undefined;
}

/**
 * Matches a spreadsheet's word to one of our enum members.
 *
 * The file says "Co-Courier", "co courier" or "CO_COURIER" depending on who
 * exported it, and all three mean the same thing.
 */
function parseEnum<T extends string>(value: string, members: readonly T[]): T | undefined {
  if (!value.trim()) return undefined;
  const key = normaliseHeader(value);
  return members.find((member) => normaliseHeader(member) === key);
}

/**
 * Reads the three date shapes these files actually contain.
 *
 * The client's data is dd/mm/yyyy — "01/01/2026" and "21/12/2020" — which is
 * unambiguous only because 21 cannot be a month. A real cell arrives as an
 * ISO string from the parser, and a hand-typed one may be yyyy-mm-dd. Nothing
 * is guessed: an unrecognised value returns undefined and the row fails,
 * because a silently wrong start date is a silently wrong contract.
 */
function parseDate(value: string): string | undefined {
  const text = value.trim();
  if (!text) return undefined;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    if (day < 1 || day > 31 || month < 1 || month > 12) return undefined;
    return `${dmy[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return undefined;
}

const CUSTOMER_TYPES = ["CUSTOMER", "CO_COURIER", "FRANCHISEE"] as const;
const REGISTER_TYPES = ["REGISTERED", "UNREGISTERED", "B2B", "B2C"] as const;
const PAYMENT_TYPES = ["CASH", "CHEQUE", "CREDIT", "TOPAY"] as const;
const BILLING_TYPES = ["ALL", "DAILY", "WEEKLY", "FORTNIGHTLY", "MONTHLY"] as const;

@Injectable()
export class CustomerImportService {
  constructor(private readonly prisma: PrismaService) {}

  /** The columns an import file may carry, for the template download. */
  /**
   * The columns an import file may carry, for the template download.
   *
   * These are the client's own headings from CustomerMaster, in their order,
   * so a file filled in from the template and a file exported from the legacy
   * system look the same to whoever has to check them.
   */
  static readonly TEMPLATE_HEADERS = [
    "Customer Code",
    "Customer Name",
    "Contact Person",
    "Address1",
    "Address2",
    "Address3",
    "Address4",
    "Pin Code",
    "Tel No. 1",
    "Tel No. 2",
    "Email ID",
    "Mobile",
    "Fax No",
    "State",
    "Service Centre",
    "Start Date",
    "Status",
    "Origin",
    "GST No.",
    "Aadhar No.",
    "Passport No.",
    "PAN No.",
    "TAN No.",
    "Invoice Format",
    "Co-Courier",
    "Payment Type",
    "Billing Type",
    "Contract Amount",
    "Credit Percentage",
    "Contract Head",
    "Fuel Surcharge",
    "Sales Executive",
    "Global Customer",
    "CUSTOMER_E_MAIL_ACCT",
    "Register_type",
    "Tax",
    "Einvoice",
  ];

  async run(buffer: Buffer, filename: string, mode: "preview" | "commit"): Promise<ImportReport> {
    const { clientId, actor } = requireRequestContext();
    const sheet = await parseSpreadsheet(buffer, filename);

    return this.prisma.forClient(clientId!, async (tx) => {
      const [centres, branches, destinations, executives, states, existing] = await Promise.all([
        tx.serviceCentre.findMany({ where: { deletedAt: null } }),
        tx.branch.findMany({ where: { deletedAt: null } }),
        tx.destination.findMany({ where: { deletedAt: null } }),
        tx.salesExecutive.findMany({ where: { deletedAt: null } }),
        tx.state.findMany({ where: { countryCode: "IN" } }),
        tx.customer.findMany({ where: { deletedAt: null } }),
      ]);

      // Code and name both resolve, because a file exported for humans says
      // "Delhi" and one exported from the old system says "DEL".
      const index = <T extends { id: string; code: string; name: string }>(rows: T[]) => {
        const map = new Map<string, string>();
        for (const row of rows) {
          map.set(normaliseHeader(row.code), row.id);
          map.set(normaliseHeader(row.name), row.id);
        }
        return map;
      };

      const centreByKey = index(centres);
      const branchByKey = index(branches);
      const destinationByKey = index(destinations);
      const executiveByKey = index(executives);

      const stateByKey = new Map<string, string>();
      for (const state of states) {
        stateByKey.set(normaliseHeader(state.code), state.code);
        stateByKey.set(normaliseHeader(state.name), state.code);
      }

      const existingByCode = new Map(existing.map((customer) => [customer.code, customer]));
      const seenInFile = new Set<string>();
      const outcomes: RowOutcome[] = [];

      // Reported as row 1 — the header — because that is where the columns
      // are, and because it must be visible in the preview before anyone
      // commits believing the logins came across.
      const refused = REFUSED_COLUMNS.filter((column) => sheet.headers.includes(column));
      if (refused.length > 0) {
        outcomes.push({
          row: 1,
          status: "skipped",
          code: "—",
          message: `Ignored ${refused.length === 1 ? "column" : "columns"} carrying portal credentials. A portal login is a user account with a hashed password, not a customer column, and this system will not store one it can read.`,
        });
      }
      const pending: Array<{ id: string | null; data: Record<string, unknown> }> = [];

      for (const [rowIndex, row] of sheet.rows.entries()) {
        // +2 because row 1 is the header and spreadsheets are 1-based, so this
        // is the number in Excel's gutter.
        const rowNumber = rowIndex + 2;
        const code = pick(row, COLUMNS.code).trim().toUpperCase();
        const name = pick(row, COLUMNS.name).trim();

        const fail = (message: string) =>
          outcomes.push({ row: rowNumber, status: "error", code: code || "—", message });

        if (!code) {
          fail("Customer code is missing.");
          continue;
        }
        if (!/^[A-Z0-9-]{1,20}$/.test(code)) {
          fail(`"${code}" is not a valid code — letters, numbers and hyphens, up to 20 characters.`);
          continue;
        }
        if (!name) {
          fail("Customer name is missing.");
          continue;
        }
        // Caught here rather than at the database, which would see only the
        // second write and report a constraint violation with no row number.
        if (seenInFile.has(code)) {
          fail(`"${code}" appears more than once in this file.`);
          continue;
        }
        seenInFile.add(code);

        const lookup = (
          text: string,
          map: Map<string, string>,
          label: string,
        ): string | null | undefined => {
          if (!text.trim()) return null;
          const found = map.get(normaliseHeader(text));
          if (!found) {
            fail(`${label} "${text}" does not exist. Create it first, or correct the spelling.`);
            return undefined;
          }
          return found;
        };

        const centreText = pick(row, COLUMNS.serviceCentre);
        const serviceCentreId = lookup(centreText, centreByKey, "Service centre");
        if (serviceCentreId === undefined) continue;

        const branchText = pick(row, COLUMNS.branch);
        const branchId = lookup(branchText, branchByKey, "Branch");
        if (branchId === undefined) continue;

        const originText = pick(row, COLUMNS.origin);
        const originId = lookup(originText, destinationByKey, "Origin");
        if (originId === undefined) continue;

        const executiveText = pick(row, COLUMNS.salesExecutive);
        const salesExecutiveId = lookup(executiveText, executiveByKey, "Sales executive");
        if (salesExecutiveId === undefined) continue;

        const stateText = pick(row, COLUMNS.stateCode);
        const stateCode = stateText ? stateByKey.get(normaliseHeader(stateText)) : null;
        if (stateText && !stateCode) {
          fail(`State "${stateText}" is not an Indian state or union territory.`);
          continue;
        }

        const billingStateText = pick(row, COLUMNS.billingStateCode);
        const billingStateCode = billingStateText
          ? stateByKey.get(normaliseHeader(billingStateText))
          : null;
        if (billingStateText && !billingStateCode) {
          fail(`Billing state "${billingStateText}" is not an Indian state or union territory.`);
          continue;
        }

        const customerTypeText = pick(row, COLUMNS.customerType);
        const customerType = parseEnum(customerTypeText, CUSTOMER_TYPES);
        if (customerTypeText && !customerType) {
          fail(`Customer type "${customerTypeText}" must be Customer, Co-Courier or Franchisee.`);
          continue;
        }

        const registerTypeText = pick(row, COLUMNS.registerType);
        const registerType = parseEnum(registerTypeText, REGISTER_TYPES);
        if (registerTypeText && !registerType) {
          fail(`Register type "${registerTypeText}" must be Registered, Unregistered, B2B or B2C.`);
          continue;
        }

        const paymentTypeText = pick(row, COLUMNS.paymentType);
        const paymentType = parseEnum(paymentTypeText, PAYMENT_TYPES);
        if (paymentTypeText && !paymentType) {
          fail(`Payment type "${paymentTypeText}" must be Cash, Cheque, Credit or To Pay.`);
          continue;
        }

        const billingTypeText = pick(row, COLUMNS.billingType);
        const billingType = parseEnum(billingTypeText, BILLING_TYPES);
        if (billingTypeText && !billingType) {
          fail(`Billing type "${billingTypeText}" must be All, Daily, Weekly, Fortnightly or Monthly.`);
          continue;
        }

        const creditDaysText = pick(row, COLUMNS.creditDays).trim();
        const creditDays = creditDaysText ? Number(creditDaysText) : undefined;
        if (creditDaysText && (!Number.isInteger(creditDays) || creditDays! < 0 || creditDays! > 365)) {
          fail(`Credit days "${creditDaysText}" must be a whole number between 0 and 365.`);
          continue;
        }

        const creditLimitText = pick(row, COLUMNS.creditLimit).trim();
        if (creditLimitText && !/^-?\d+(\.\d+)?$/.test(creditLimitText)) {
          fail(`Credit limit "${creditLimitText}" is not a number.`);
          continue;
        }

        const contractAmountText = pick(row, COLUMNS.contractAmount).trim();
        if (contractAmountText && !/^-?\d+(\.\d+)?$/.test(contractAmountText)) {
          fail(`Contract amount "${contractAmountText}" is not a number.`);
          continue;
        }

        const creditPercentText = pick(row, COLUMNS.creditPercent).trim();
        if (creditPercentText && !/^-?\d+(\.\d+)?$/.test(creditPercentText)) {
          fail(`Credit percentage "${creditPercentText}" is not a number.`);
          continue;
        }

        const startDateText = pick(row, COLUMNS.startDate).trim();
        const startDate = startDateText ? parseDate(startDateText) : undefined;
        if (startDateText && !startDate) {
          fail(`Start date "${startDateText}" is not a date the importer recognises — use dd/mm/yyyy or yyyy-mm-dd.`);
          continue;
        }

        const current = existingByCode.get(code);

        // Only columns the file actually carries are written. A file with no
        // Payment Type column must not quietly reset every customer to Credit.
        const data: Record<string, unknown> = { code, name };
        const set = (key: string, value: unknown) => {
          if (value !== null && value !== undefined && value !== "") data[key] = value;
        };

        set("contactPerson", pick(row, COLUMNS.contactPerson).trim());
        set("addressLine1", pick(row, COLUMNS.addressLine1).trim());
        set("addressLine2", pick(row, COLUMNS.addressLine2).trim());
        set("pinCode", pick(row, COLUMNS.pinCode).trim());
        set("city", pick(row, COLUMNS.city).trim());
        set("stateCode", stateCode);
        set("billingStateCode", billingStateCode);
        set("telephone1", pick(row, COLUMNS.telephone1).trim());
        set("telephone2", pick(row, COLUMNS.telephone2).trim());
        set("mobile", pick(row, COLUMNS.mobile).trim());
        set("email", pick(row, COLUMNS.email).trim());
        set("serviceCentreId", serviceCentreId);
        set("branchId", branchId);
        set("originId", originId);
        set("salesExecutiveId", salesExecutiveId);
        set("gstin", pick(row, COLUMNS.gstin).trim().toUpperCase());
        set("pan", pick(row, COLUMNS.pan).trim().toUpperCase());
        set("tan", pick(row, COLUMNS.tan).trim().toUpperCase());
        set("customerType", customerType);
        set("registerType", registerType);
        set("paymentType", paymentType);
        set("billingType", billingType);
        set("contractHead", pick(row, COLUMNS.contractHead).trim());
        set("addressLine3", pick(row, COLUMNS.addressLine3).trim());
        set("addressLine4", pick(row, COLUMNS.addressLine4).trim());
        set("fax", pick(row, COLUMNS.fax).trim());
        set("accountEmail", pick(row, COLUMNS.accountEmail).trim());
        set("aadhaar", pick(row, COLUMNS.aadhaar).trim());
        set("passportNo", pick(row, COLUMNS.passportNo).trim());
        set("invoiceFormat", pick(row, COLUMNS.invoiceFormat).trim());
        if (creditDays !== undefined) data["creditDays"] = creditDays;
        if (creditLimitText) data["creditLimit"] = creditLimitText;
        if (contractAmountText) data["contractAmount"] = contractAmountText;
        if (creditPercentText) data["creditPercent"] = creditPercentText;
        if (startDate) data["startDate"] = new Date(`${startDate}T00:00:00Z`);

        // Their sheet has a Co-Courier flag rather than a type column, so a
        // ticked flag names the type — unless the file said the type outright.
        if (!customerType && parseBoolean(pick(row, COLUMNS.coCourier))) {
          data["customerType"] = "CO_COURIER";
        }

        for (const [key, column] of [
          ["fuelSurcharge", COLUMNS.fuelSurcharge],
          ["taxApplicable", COLUMNS.taxApplicable],
          ["eInvoice", COLUMNS.eInvoice],
          ["globalCustomer", COLUMNS.globalCustomer],
        ] as const) {
          const flag = parseBoolean(pick(row, column));
          if (flag !== undefined) data[key] = flag;
        }

        const isActive = parseBoolean(pick(row, COLUMNS.isActive));
        if (isActive !== undefined) data["isActive"] = isActive;

        pending.push({ id: current?.id ?? null, data });
        outcomes.push({ row: rowNumber, status: current ? "update" : "create", code });
      }

      const created = outcomes.filter((outcome) => outcome.status === "create").length;
      const updated = outcomes.filter((outcome) => outcome.status === "update").length;
      const failed = outcomes.filter((outcome) => outcome.status === "error").length;

      if (mode === "commit" && failed > 0) {
        return { mode, total: outcomes.length, created: 0, updated: 0, failed, aborted: true, outcomes };
      }

      if (mode === "commit") {
        for (const row of pending) {
          if (row.id) {
            await tx.customer.update({ where: { id: row.id }, data: row.data as never });
          } else {
            await tx.customer.create({ data: { clientId: clientId!, ...row.data } as never });
          }
        }

        await tx.auditEvent.create({
          data: {
            clientId: clientId!,
            actorId: actor?.userId ?? null,
            action: "masters.customer.imported",
            entity: "customer",
            metadata: { filename, created, updated, failed, total: outcomes.length },
          },
        });
      }

      return { mode, total: outcomes.length, created, updated, failed, aborted: false, outcomes };
    });
  }
}
