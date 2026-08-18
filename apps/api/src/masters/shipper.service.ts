import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@excelex/database";

import { requireRequestContext } from "../core/context/request-context";
import { paginate } from "./paged";
import { PrismaService } from "../core/database/prisma.service";

export interface ShipperInput {
  code: string;
  name: string;
  originId: string | null;
  serviceCentreId: string | null;
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
  industry: string | null;
  gstin: string | null;
  aadhaar: string | null;
  pan: string | null;
  iecNo: string | null;
  bankAdCode: string | null;
  bankAccount: string | null;
  bankIfsc: string | null;
  firm: "GOVT" | "NON_GOVT" | null;
  lutNumber: string | null;
  lutIssueDate: string | null;
  lutTillDate: string | null;
  nfei: boolean;
  isActive: boolean;
}

export interface ShipperListQuery {
  page: number;
  pageSize: number;
  search?: string;
  originId?: string;
  serviceCentreId?: string;
  status?: string;
}

/**
 * Shippers — the parties goods are collected from.
 *
 * Paged in the database like consignees, and for the same reason: a pickup
 * address book grows with every booking and nothing is ever really removed
 * from it.
 */
@Injectable()
export class ShipperService {
  constructor(private readonly prisma: PrismaService) {}

  private where(query: Omit<ShipperListQuery, "page" | "pageSize">): Prisma.ShipperWhereInput {
    const search = query.search?.trim();

    return {
      deletedAt: null,
      ...(query.originId ? { originId: query.originId } : {}),
      ...(query.serviceCentreId ? { serviceCentreId: query.serviceCentreId } : {}),
      ...(query.status ? { isActive: query.status === "active" } : {}),
      ...(search
        ? {
            // One generated column rather than an OR across several: measured
            // on 50,000 rows the planner will not combine several trigram
            // indexes and falls back to a sequential scan. Against the single
            // indexed column the same search is a bitmap index scan — 0.9ms
            // against 75ms.
            searchText: { contains: search, mode: "insensitive" as const },
          }
        : {}),
    };
  }

  async list(query: ShipperListQuery) {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) =>
      paginate(
        tx.shipper,
        {
          where: this.where(query),
          include: { origin: true, serviceCentre: true },
          orderBy: [{ code: "asc" }],
          request: { page: query.page, pageSize: query.pageSize },
        },
        serialise,
      ),
    );
  }

  async listForExport(query: Omit<ShipperListQuery, "page" | "pageSize">) {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) =>
      tx.shipper.findMany({
        where: this.where(query),
        include: { origin: true, serviceCentre: true },
        orderBy: [{ code: "asc" }],
        // Past this the honest answer is a report, not a file.
        take: 20000,
      }),
    );
  }

  async byId(id: string) {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.shipper.findFirst({
        where: { id, deletedAt: null },
        include: { origin: true, serviceCentre: true },
      });
      return row ? serialise(row) : null;
    });
  }

  async create(input: ShipperInput): Promise<{ id: string }> {
    const { clientId, actor } = requireRequestContext();
    const code = input.code.trim().toUpperCase();

    return this.prisma.forClient(clientId!, async (tx) => {
      const clash = await tx.shipper.findFirst({ where: { code, deletedAt: null } });
      if (clash) throw new BadRequestException(`A shipper with code "${code}" already exists.`);

      const row = await tx.shipper.create({
        data: { clientId: clientId!, ...toData(input), code },
      });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.shipper.created",
          entity: "shipper",
          entityId: row.id,
          metadata: { code, name: input.name },
        },
      });

      return { id: row.id };
    });
  }

  async update(id: string, input: ShipperInput): Promise<void> {
    const { clientId, actor } = requireRequestContext();
    const code = input.code.trim().toUpperCase();

    await this.prisma.forClient(clientId!, async (tx) => {
      const before = await tx.shipper.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException("Shipper not found.");

      const clash = await tx.shipper.findFirst({ where: { code, deletedAt: null, NOT: { id } } });
      if (clash) throw new BadRequestException("Another shipper already uses that code.");

      await tx.shipper.update({ where: { id }, data: { ...toData(input), code } });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.shipper.updated",
          entity: "shipper",
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
      const row = await tx.shipper.findFirst({ where: { id, deletedAt: null } });
      if (!row) throw new NotFoundException("Shipper not found.");

      await tx.shipper.update({ where: { id }, data: { deletedAt: new Date() } });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.shipper.deleted",
          entity: "shipper",
          entityId: id,
          metadata: { code: row.code, name: row.name },
        },
      });
    });
  }
}

function toData(input: ShipperInput) {
  return {
    name: input.name.trim(),
    originId: input.originId,
    serviceCentreId: input.serviceCentreId,
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
    industry: input.industry,
    gstin: input.gstin,
    aadhaar: input.aadhaar,
    pan: input.pan,
    iecNo: input.iecNo,
    bankAdCode: input.bankAdCode,
    bankAccount: input.bankAccount,
    bankIfsc: input.bankIfsc,
    firm: input.firm,
    // Dates only, so no time of day can shift one across a border.
    lutIssueDate: input.lutIssueDate ? new Date(`${input.lutIssueDate}T00:00:00Z`) : null,
    lutTillDate: input.lutTillDate ? new Date(`${input.lutTillDate}T00:00:00Z`) : null,
    lutNumber: input.lutNumber,
    nfei: input.nfei,
    isActive: input.isActive,
  };
}

type ShipperRow = Prisma.ShipperGetPayload<{
  include: { origin: true; serviceCentre: true };
}>;

function serialise(row: ShipperRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    contactPerson: row.contactPerson,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    pinCode: row.pinCode,
    city: row.city,
    stateCode: row.stateCode,
    countryCode: row.countryCode,
    telephone1: row.telephone1,
    telephone2: row.telephone2,
    fax: row.fax,
    email: row.email,
    mobile: row.mobile,
    industry: row.industry,
    gstin: row.gstin,
    aadhaar: row.aadhaar,
    pan: row.pan,
    iecNo: row.iecNo,
    bankAdCode: row.bankAdCode,
    bankAccount: row.bankAccount,
    bankIfsc: row.bankIfsc,
    firm: row.firm,
    lutNumber: row.lutNumber,
    lutIssueDate: row.lutIssueDate ? row.lutIssueDate.toISOString().slice(0, 10) : null,
    lutTillDate: row.lutTillDate ? row.lutTillDate.toISOString().slice(0, 10) : null,
    nfei: row.nfei,
    isActive: row.isActive,
    origin: row.origin
      ? { id: row.origin.id, code: row.origin.code, name: row.origin.name }
      : null,
    serviceCentre: row.serviceCentre
      ? { id: row.serviceCentre.id, code: row.serviceCentre.code, name: row.serviceCentre.name }
      : null,
  };
}
