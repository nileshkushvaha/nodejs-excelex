import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@excelex/database";

import { requireRequestContext } from "../core/context/request-context";
import { PrismaService } from "../core/database/prisma.service";
import { paginate, type PageRequest } from "./paged";

export interface RateListQuery extends PageRequest {
  customerId?: string;
  productId?: string;
  originId?: string;
  destinationId?: string;
  /** Only tariffs in force on this date. */
  on?: string;
  status?: string;
}

const INCLUDE = {
  customer: true,
  product: true,
  origin: true,
  destination: true,
  zone: true,
  lines: true,
} as const;

@Injectable()
export class RateService {
  constructor(private readonly prisma: PrismaService) {}

  private where(query: Omit<RateListQuery, "page" | "pageSize">): Prisma.RateCardWhereInput {
    return {
      deletedAt: null,
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.originId ? { originId: query.originId } : {}),
      ...(query.destinationId ? { destinationId: query.destinationId } : {}),
      ...(query.status ? { isActive: query.status === "active" } : {}),
      // In force on a date: started, and either open-ended or not yet ended.
      ...(query.on
        ? {
            effectiveFrom: { lte: new Date(`${query.on}T00:00:00Z`) },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date(`${query.on}T00:00:00Z`) } }],
          }
        : {}),
    };
  }

  async list(query: RateListQuery) {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) =>
      paginate(
        tx.rateCard,
        {
          where: this.where(query),
          include: INCLUDE,
          orderBy: [{ effectiveFrom: "desc" }],
          request: { page: query.page, pageSize: query.pageSize },
        },
        serialise,
      ),
    );
  }

  /** One row per line, for an export that matches the import format. */
  async listForExport(query: Omit<RateListQuery, "page" | "pageSize">) {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const cards = await tx.rateCard.findMany({
        where: this.where(query),
        include: INCLUDE,
        orderBy: [{ effectiveFrom: "desc" }],
        take: 5000,
      });

      return cards.flatMap((card) =>
        card.lines.map((line) => [
          card.origin?.code ?? "",
          card.customer?.code ?? "",
          card.effectiveFrom,
          card.vendor ?? "",
          card.product?.code ?? "",
          card.service ?? "",
          card.zone?.code ?? "",
          card.countryCode ?? "",
          card.destination?.code ?? "",
          line.lineType,
          String(line.weight),
          String(line.rate),
          card.awbCharge === null ? "" : String(card.awbCharge),
          card.unit === "LBS" ? "Lbs" : "Kgs",
          card.days ?? "",
        ]),
      );
    });
  }

  async byId(id: string) {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.rateCard.findFirst({
        where: { id, deletedAt: null },
        include: INCLUDE,
      });
      return row ? serialise(row) : null;
    });
  }

  async remove(id: string): Promise<void> {
    const { clientId, actor } = requireRequestContext();

    await this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.rateCard.findFirst({ where: { id, deletedAt: null } });
      if (!row) throw new NotFoundException("Rate not found.");

      // Soft-deleted, never removed: an invoice raised against this tariff
      // must still be explainable, and the lines are the explanation.
      await tx.rateCard.update({ where: { id }, data: { deletedAt: new Date() } });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.rate.deleted",
          entity: "rate_card",
          entityId: id,
          metadata: { effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10) },
        },
      });
    });
  }
}

type Row = Prisma.RateCardGetPayload<{ include: typeof INCLUDE }>;

function serialise(row: Row) {
  return {
    id: row.id,
    kind: row.kind,
    effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
    effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString().slice(0, 10) : null,
    unit: row.unit,
    days: row.days,
    vendor: row.vendor,
    service: row.service,
    countryCode: row.countryCode,
    awbCharge: row.awbCharge === null ? null : String(row.awbCharge),
    isActive: row.isActive,
    customer: row.customer ? { id: row.customer.id, code: row.customer.code, name: row.customer.name } : null,
    product: row.product ? { id: row.product.id, code: row.product.code, name: row.product.name } : null,
    origin: row.origin ? { id: row.origin.id, code: row.origin.code, name: row.origin.name } : null,
    destination: row.destination
      ? { id: row.destination.id, code: row.destination.code, name: row.destination.name }
      : null,
    zone: row.zone ? { id: row.zone.id, code: row.zone.code, name: row.zone.name } : null,
    lines: row.lines
      .sort((a, b) => Number(a.weight) - Number(b.weight))
      .map((line) => ({
        id: line.id,
        lineType: line.lineType,
        weight: String(line.weight),
        rate: String(line.rate),
      })),
  };
}
