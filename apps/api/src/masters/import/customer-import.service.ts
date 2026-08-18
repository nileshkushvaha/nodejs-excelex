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

/** Accepted spellings for each column, normalised. */
const COLUMNS = {
  code: ["customercode", "code"],
  name: ["customername", "name"],
  contactPerson: ["contactperson", "contact"],
  addressLine1: ["address1", "addressline1", "address"],
  addressLine2: ["address2", "addressline2"],
  pinCode: ["pincode", "pin", "postcode"],
  city: ["city"],
  stateCode: ["state", "statecode"],
  billingStateCode: ["billingstate", "customerbillingstate", "billingstatecode"],
  telephone1: ["telno1", "telephone1", "phone", "telephone"],
  telephone2: ["telno2", "telephone2"],
  mobile: ["mobile", "mobileno", "cell"],
  email: ["email", "emailid"],
  serviceCentre: ["servicecentre", "servicecenter"],
  branch: ["branch"],
  origin: ["origin"],
  gstin: ["gstno", "gstin", "gst"],
  pan: ["panno", "pan"],
  tan: ["tanno", "tan"],
  customerType: ["customertype", "type"],
  registerType: ["registertype", "registrationtype"],
  paymentType: ["paymenttype", "payment"],
  billingType: ["billingtype", "billingcycle"],
  creditDays: ["creditdays"],
  creditLimit: ["creditlimit"],
  contractHead: ["contracthead"],
  salesExecutive: ["salesexecutive", "salesex", "salesexcode"],
  isActive: ["status", "active", "isactive"],
} as const;

function pick(row: Record<string, string>, names: readonly string[]): string {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

function parseBoolean(value: string): boolean | undefined {
  const text = value.trim().toLowerCase();
  if (!text) return undefined;
  if (["y", "yes", "true", "1", "active", "on"].includes(text)) return true;
  if (["n", "no", "false", "0", "inactive", "off"].includes(text)) return false;
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

const CUSTOMER_TYPES = ["CUSTOMER", "CO_COURIER", "FRANCHISEE"] as const;
const REGISTER_TYPES = ["REGISTERED", "UNREGISTERED", "B2B", "B2C"] as const;
const PAYMENT_TYPES = ["CASH", "CHEQUE", "CREDIT", "TOPAY"] as const;
const BILLING_TYPES = ["ALL", "DAILY", "WEEKLY", "FORTNIGHTLY", "MONTHLY"] as const;

@Injectable()
export class CustomerImportService {
  constructor(private readonly prisma: PrismaService) {}

  /** The columns an import file may carry, for the template download. */
  static readonly TEMPLATE_HEADERS = [
    "Customer Code",
    "Customer Name",
    "Contact Person",
    "Address 1",
    "Address 2",
    "Pin Code",
    "City",
    "State",
    "Billing State",
    "Tel No 1",
    "Tel No 2",
    "Mobile",
    "Email",
    "Service Centre",
    "Branch",
    "Origin",
    "GST No",
    "PAN No",
    "TAN No",
    "Customer Type",
    "Register Type",
    "Payment Type",
    "Billing Type",
    "Credit Days",
    "Credit Limit",
    "Contract Head",
    "Sales Executive",
    "Status",
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
        if (creditDays !== undefined) data["creditDays"] = creditDays;
        if (creditLimitText) data["creditLimit"] = creditLimitText;

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
