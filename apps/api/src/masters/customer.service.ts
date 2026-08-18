import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@excelex/database";

import { requireRequestContext } from "../core/context/request-context";
import { paginate } from "./paged";
import { PrismaService } from "../core/database/prisma.service";

/** The columns the list screen shows, and nothing else. */
export interface CustomerRow {
  id: string;
  code: string;
  name: string;
  contactPerson: string | null;
  mobile: string | null;
  email: string | null;
  isActive: boolean;
  contractHead: string | null;
  branch: { id: string; code: string; name: string } | null;
  serviceCentre: { id: string; code: string; name: string } | null;
}

export interface CustomerPage {
  rows: CustomerRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface CustomerListQuery {
  page: number;
  pageSize: number;
  search?: string;
  branchId?: string;
  serviceCentreId?: string;
  customerType?: string;
  status?: string;
}

/**
 * Customers — the businesses that ship with this client.
 *
 * Not to be confused with the client itself. The list screen shows both in
 * the same row (a customer, and the service centre of ours that invoices it),
 * which is exactly why docs/GLOSSARY.md makes the two words binding.
 *
 * Paged in the database rather than the browser. A client runs to thousands
 * of customers, and sending all of them so the browser can show ten is the
 * trip this master cannot afford.
 */
@Injectable()
export class CustomerService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: CustomerListQuery): Promise<CustomerPage> {
    const { clientId } = requireRequestContext();

    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.serviceCentreId ? { serviceCentreId: query.serviceCentreId } : {}),
      ...(query.customerType ? { customerType: query.customerType as never } : {}),
      ...(query.status ? { isActive: query.status === "active" } : {}),
      ...(query.search?.trim()
        ? {
            // One generated column rather than an OR across several: measured
            // on 50,000 rows the planner will not combine several trigram
            // indexes and falls back to a sequential scan. Against the single
            // indexed column the same search is a bitmap index scan — 0.9ms
            // against 75ms.
            searchText: { contains: query.search.trim(), mode: "insensitive" as const },
          }
        : {}),
    };

    return this.prisma.forClient(clientId!, async (tx) =>
      paginate(
        tx.customer,
        {
          where,
          include: { branch: true, serviceCentre: true },
          orderBy: { code: "asc" },
          request: { page: query.page, pageSize: query.pageSize },
        },
        toRow,
      ),
    );
  }

  /**
   * Every row the current filters select, unpaged, for the export.
   *
   * Deliberately not reusing list(): an export that silently gave you page one
   * of your filter would be worse than no export at all. Capped, because a
   * client with a hundred thousand customers should be asking for a report,
   * not a spreadsheet the browser has to hold.
   */
  async listForExport(query: Omit<CustomerListQuery, "page" | "pageSize">) {
    const { clientId } = requireRequestContext();

    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.serviceCentreId ? { serviceCentreId: query.serviceCentreId } : {}),
      ...(query.customerType ? { customerType: query.customerType as never } : {}),
      ...(query.status ? { isActive: query.status === "active" } : {}),
      ...(query.search?.trim()
        ? {
            // One generated column rather than an OR across several: measured
            // on 50,000 rows the planner will not combine several trigram
            // indexes and falls back to a sequential scan. Against the single
            // indexed column the same search is a bitmap index scan — 0.9ms
            // against 75ms.
            searchText: { contains: query.search.trim(), mode: "insensitive" as const },
          }
        : {}),
    };

    return this.prisma.forClient(clientId!, async (tx) =>
      tx.customer.findMany({
        where,
        include: { branch: true, serviceCentre: true, origin: true, salesExecutive: true },
        orderBy: { code: "asc" },
        // Past this the honest answer is a report, not a file the browser has
        // to hold in memory and Excel has to open.
        take: 20000,
      }),
    );
  }

  /** The whole row, for the edit form. */
  async byId(id: string) {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.customer.findFirst({
        where: { id, deletedAt: null },
        include: { branch: true, serviceCentre: true, origin: true, salesExecutive: true },
      });
      if (!row) return null;
      return serialise(row);
    });
  }

  async create(input: CustomerInput): Promise<{ id: string }> {
    const { clientId, actor } = requireRequestContext();
    const code = input.code.trim().toUpperCase();

    return this.prisma.forClient(clientId!, async (tx) => {
      const clash = await tx.customer.findFirst({ where: { code, deletedAt: null } });
      if (clash) throw new BadRequestException(`A customer with code "${code}" already exists.`);

      const row = await tx.customer.create({
        data: { clientId: clientId!, ...toData(input), code },
      });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.customer.created",
          entity: "customer",
          entityId: row.id,
          metadata: { code, name: input.name },
        },
      });

      return { id: row.id };
    });
  }

  async update(id: string, input: CustomerInput): Promise<void> {
    const { clientId, actor } = requireRequestContext();
    const code = input.code.trim().toUpperCase();

    await this.prisma.forClient(clientId!, async (tx) => {
      const before = await tx.customer.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException("Customer not found.");

      const clash = await tx.customer.findFirst({
        where: { code, deletedAt: null, NOT: { id } },
      });
      if (clash) throw new BadRequestException("Another customer already uses that code.");

      await tx.customer.update({ where: { id }, data: { ...toData(input), code } });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.customer.updated",
          entity: "customer",
          entityId: id,
          metadata: {
            from: { code: before.code, name: before.name },
            to: { code, name: input.name },
          },
        },
      });
    });
  }

  async remove(id: string): Promise<void> {
    const { clientId, actor } = requireRequestContext();

    await this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.customer.findFirst({ where: { id, deletedAt: null } });
      if (!row) throw new NotFoundException("Customer not found.");

      // The children cascade in the database on a hard delete, but this is a
      // soft delete, so they are stamped explicitly. Leaving them live would
      // let a restored customer come back with rates nobody has reviewed.
      const deletedAt = new Date();
      await tx.customerFuelSurcharge.updateMany({
        where: { customerId: id, deletedAt: null },
        data: { deletedAt },
      });
      await tx.customerCharge.updateMany({
        where: { customerId: id, deletedAt: null },
        data: { deletedAt },
      });
      await tx.customerVolumetric.updateMany({
        where: { customerId: id, deletedAt: null },
        data: { deletedAt },
      });
      await tx.customerContact.updateMany({
        where: { customerId: id, deletedAt: null },
        data: { deletedAt },
      });
      await tx.customer.update({ where: { id }, data: { deletedAt } });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.customer.deleted",
          entity: "customer",
          entityId: id,
          metadata: { code: row.code, name: row.name },
        },
      });
    });
  }
}

/**
 * The shape the API accepts and returns for one customer.
 *
 * Decimals cross the wire as strings. A rupee amount that round-trips through
 * a JavaScript number comes back subtly different, and these are contract
 * values and credit limits.
 */
export interface CustomerInput {
  code: string;
  name: string;
  contactPerson: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  pinCode: string | null;
  city: string | null;
  stateCode: string | null;
  countryCode: string;
  telephone1: string | null;
  telephone2: string | null;
  fax: string | null;
  email: string | null;
  mobile: string | null;
  billingStateCode: string | null;
  serviceCentreId: string | null;
  originId: string | null;
  branchId: string | null;
  startDate: string;
  gstin: string | null;
  aadhaar: string | null;
  aadhaarDob: string | null;
  passportNo: string | null;
  pan: string | null;
  tan: string | null;
  invoiceFormat: string | null;
  customerType: "CUSTOMER" | "CO_COURIER" | "FRANCHISEE";
  registerType: "REGISTERED" | "UNREGISTERED" | "B2B" | "B2C";

  paymentType: "CASH" | "CHEQUE" | "CREDIT" | "TOPAY";
  billingType: "ALL" | "DAILY" | "WEEKLY" | "FORTNIGHTLY" | "MONTHLY" | null;
  contractAmount: string | null;
  creditDays: number;
  registrationNo: string | null;
  instructions: string | null;
  roundRupee: string | null;
  roundPaisa: string | null;
  contractHead: string | null;
  ledgerHead: string | null;
  contractOrigin: string | null;
  businessChannel: string | null;
  iecNo: string | null;
  bankAdCode: string | null;
  bankAccount: string | null;
  bankIfsc: string | null;
  firm: "GOVT" | "NON_GOVT" | null;
  shipperType: "INDIVIDUAL" | "MSME" | null;
  lutNumber: string | null;
  lutIssueDate: string | null;
  lutTillDate: string | null;
  nfei: boolean;
  fuelSurcharge: boolean;
  taxApplicable: boolean;
  noTariff: boolean;
  inclusiveTax: boolean;

  contractNo: string | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  creditLimit: string | null;
  securityDeposit: string | null;
  contractNotes: string | null;

  salesExecutiveId: string | null;
  incentiveType: "PERCENTAGE" | "INCENTIVE" | "FIXED";
  incentivePercent: string;
  customerMessage: string | null;
  accountEmail: string | null;
  bestRate: string | null;
  monthlySales: string | null;
  defaultVendor: string | null;
  area: string | null;
  industry: string | null;
  globalCustomer: boolean;
  measurementUnit: "CENTIMETER" | "INCH";
  geoLocation: string | null;
  disableCustomerOrigin: boolean;
  enableTaxDutiesPaidBy: boolean;
  enableAwbNo: boolean;

  eStatement: boolean;
  eInvoice: boolean;
  allowZeroAmount: boolean;
  isActive: boolean;
}

/** Dates arrive as yyyy-mm-dd and are stored as dates, with no time to shift. */
const date = (value: string | null) => (value ? new Date(`${value}T00:00:00Z`) : null);

function toData(input: CustomerInput) {
  return {
    name: input.name.trim(),
    contactPerson: input.contactPerson,
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2,
    pinCode: input.pinCode,
    city: input.city,
    stateCode: input.stateCode,
    countryCode: input.countryCode,
    telephone1: input.telephone1,
    telephone2: input.telephone2,
    fax: input.fax,
    email: input.email,
    mobile: input.mobile,
    billingStateCode: input.billingStateCode,
    serviceCentreId: input.serviceCentreId,
    originId: input.originId,
    branchId: input.branchId,
    startDate: date(input.startDate) ?? new Date(),
    gstin: input.gstin,
    aadhaar: input.aadhaar,
    aadhaarDob: date(input.aadhaarDob),
    passportNo: input.passportNo,
    pan: input.pan,
    tan: input.tan,
    invoiceFormat: input.invoiceFormat,
    customerType: input.customerType,
    registerType: input.registerType,

    paymentType: input.paymentType,
    billingType: input.billingType,
    contractAmount: input.contractAmount,
    creditDays: input.creditDays,
    registrationNo: input.registrationNo,
    instructions: input.instructions,
    roundRupee: input.roundRupee,
    roundPaisa: input.roundPaisa,
    contractHead: input.contractHead,
    ledgerHead: input.ledgerHead,
    contractOrigin: input.contractOrigin,
    businessChannel: input.businessChannel,
    iecNo: input.iecNo,
    bankAdCode: input.bankAdCode,
    bankAccount: input.bankAccount,
    bankIfsc: input.bankIfsc,
    firm: input.firm,
    shipperType: input.shipperType,
    lutNumber: input.lutNumber,
    lutIssueDate: date(input.lutIssueDate),
    lutTillDate: date(input.lutTillDate),
    nfei: input.nfei,
    fuelSurcharge: input.fuelSurcharge,
    taxApplicable: input.taxApplicable,
    noTariff: input.noTariff,
    inclusiveTax: input.inclusiveTax,

    contractNo: input.contractNo,
    contractStartDate: date(input.contractStartDate),
    contractEndDate: date(input.contractEndDate),
    creditLimit: input.creditLimit,
    securityDeposit: input.securityDeposit,
    contractNotes: input.contractNotes,

    salesExecutiveId: input.salesExecutiveId,
    incentiveType: input.incentiveType,
    incentivePercent: input.incentivePercent,
    customerMessage: input.customerMessage,
    accountEmail: input.accountEmail,
    bestRate: input.bestRate,
    monthlySales: input.monthlySales,
    defaultVendor: input.defaultVendor,
    area: input.area,
    industry: input.industry,
    globalCustomer: input.globalCustomer,
    measurementUnit: input.measurementUnit,
    geoLocation: input.geoLocation,
    disableCustomerOrigin: input.disableCustomerOrigin,
    enableTaxDutiesPaidBy: input.enableTaxDutiesPaidBy,
    enableAwbNo: input.enableAwbNo,

    eStatement: input.eStatement,
    eInvoice: input.eInvoice,
    allowZeroAmount: input.allowZeroAmount,
    isActive: input.isActive,
  };
}

/** Decimals out as strings, dates out as yyyy-mm-dd. */
function serialise(row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value instanceof Date) {
      out[key] = value.toISOString().slice(0, 10);
    } else if (value !== null && typeof value === "object" && "toFixed" in value) {
      out[key] = String(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** The list row, from the record the query loaded. */
function toRow(row: {
  id: string;
  code: string;
  name: string;
  contactPerson: string | null;
  mobile: string | null;
  email: string | null;
  isActive: boolean;
  contractHead: string | null;
  branch: { id: string; code: string; name: string } | null;
  serviceCentre: { id: string; code: string; name: string } | null;
}): CustomerRow {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    contactPerson: row.contactPerson,
    mobile: row.mobile,
    email: row.email,
    isActive: row.isActive,
    contractHead: row.contractHead,
    branch: row.branch ? { id: row.branch.id, code: row.branch.code, name: row.branch.name } : null,
    serviceCentre: row.serviceCentre
      ? { id: row.serviceCentre.id, code: row.serviceCentre.code, name: row.serviceCentre.name }
      : null,
  };
}
