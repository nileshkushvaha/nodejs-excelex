import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { requireRequestContext } from "../core/context/request-context";
import { PrismaService } from "../core/database/prisma.service";

export type ChargeType = "AIRWAYBILL" | "EXPENSE" | "INCOME" | "PURCHASE";

export type ChargeCalculationBase =
  | "ACTUAL_WEIGHT"
  | "CHARGE_WEIGHT"
  | "COD_AMOUNT"
  | "COMMERCIAL"
  | "FLAT"
  | "FREIGHT"
  | "ODA"
  | "ODA1"
  | "ODA2"
  | "ODA3"
  | "PIECES"
  | "POINT"
  | "SHIPMENT_VALUE";

export interface ChargeView {
  id: string;
  code: string;
  name: string;
  chargeType: ChargeType;
  calculationBase: ChargeCalculationBase;
  /**
   * Sent as a string, for the same reason commission is: the column is exact
   * decimal because it reaches an invoice, and a JavaScript number would undo
   * that on the way out.
   */
  rate: string;
  applyFuel: boolean;
  applyTaxOnFuel: boolean;
  applyTax: boolean;
  hsnCode: string | null;
  sequence: number;
  applyFuelOnComponents: boolean;
  isActive: boolean;
  /** The charges gathered under this one — the legacy "Multiple Charges". */
  components: { id: string; code: string; name: string }[];
}

export interface ChargeInput {
  code: string;
  name: string;
  chargeType: ChargeType;
  calculationBase: ChargeCalculationBase;
  rate: string;
  applyFuel: boolean;
  applyTaxOnFuel: boolean;
  applyTax: boolean;
  hsnCode: string | null;
  sequence: number;
  applyFuelOnComponents: boolean;
  isActive: boolean;
  componentIds: string[];
}

/**
 * Charges — the lines that can appear on an invoice beside the freight.
 *
 * A charge may gather other charges under it, so a single line on a booking
 * screen applies several. That is one level deep by design: the legacy screen
 * offers a flat checklist, and nesting composites inside composites would make
 * "what does this bill" a graph walk rather than a lookup.
 */
@Injectable()
export class ChargeService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ChargeView[]> {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const rows = await tx.charge.findMany({
        where: { deletedAt: null },
        // Sequence is where the client puts a charge on a printed invoice; code
        // breaks ties so a table left at zero still has a stable order.
        orderBy: [{ sequence: "asc" }, { code: "asc" }],
        include: {
          components: {
            include: { component: { select: { id: true, code: true, name: true } } },
          },
        },
      });

      return rows.map((row) => this.toView(row));
    });
  }

  async byId(id: string): Promise<ChargeView | null> {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.charge.findFirst({
        where: { id, deletedAt: null },
        include: {
          components: {
            include: { component: { select: { id: true, code: true, name: true } } },
          },
        },
      });
      return row ? this.toView(row) : null;
    });
  }

  async create(input: ChargeInput): Promise<{ id: string }> {
    const { clientId, actor } = requireRequestContext();
    const code = input.code.trim().toUpperCase();

    return this.prisma.forClient(clientId!, async (tx) => {
      const clash = await tx.charge.findFirst({ where: { code, deletedAt: null } });
      if (clash) throw new BadRequestException(`A charge with code "${code}" already exists.`);

      const componentIds = await this.resolveComponents(tx, input.componentIds, null);

      const row = await tx.charge.create({
        data: {
          clientId: clientId!,
          code,
          name: input.name.trim(),
          chargeType: input.chargeType,
          calculationBase: input.calculationBase,
          rate: input.rate,
          applyFuel: input.applyFuel,
          applyTaxOnFuel: input.applyTaxOnFuel,
          applyTax: input.applyTax,
          hsnCode: input.hsnCode,
          sequence: input.sequence,
          applyFuelOnComponents: input.applyFuelOnComponents,
          isActive: input.isActive,
          components: {
            create: componentIds.map((componentId) => ({ clientId: clientId!, componentId })),
          },
        },
      });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.charge.created",
          entity: "charge",
          entityId: row.id,
          metadata: { code, name: input.name.trim(), components: componentIds.length },
        },
      });

      return { id: row.id };
    });
  }

  async update(id: string, input: ChargeInput): Promise<void> {
    const { clientId, actor } = requireRequestContext();
    const code = input.code.trim().toUpperCase();

    await this.prisma.forClient(clientId!, async (tx) => {
      const before = await tx.charge.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException("Charge not found.");

      const clash = await tx.charge.findFirst({ where: { code, deletedAt: null, NOT: { id } } });
      if (clash) throw new BadRequestException("Another charge already uses that code.");

      const componentIds = await this.resolveComponents(tx, input.componentIds, id);

      await tx.charge.update({
        where: { id },
        data: {
          code,
          name: input.name.trim(),
          chargeType: input.chargeType,
          calculationBase: input.calculationBase,
          rate: input.rate,
          applyFuel: input.applyFuel,
          applyTaxOnFuel: input.applyTaxOnFuel,
          applyTax: input.applyTax,
          hsnCode: input.hsnCode,
          sequence: input.sequence,
          applyFuelOnComponents: input.applyFuelOnComponents,
          isActive: input.isActive,
          // Replaced wholesale: the form posts the full checklist, so a
          // component missing from it has been unticked.
          components: {
            deleteMany: {},
            create: componentIds.map((componentId) => ({ clientId: clientId!, componentId })),
          },
        },
      });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.charge.updated",
          entity: "charge",
          entityId: id,
          metadata: {
            from: { code: before.code, name: before.name, rate: before.rate.toString() },
            to: { code, name: input.name.trim(), rate: input.rate },
          },
        },
      });
    });
  }

  async remove(id: string): Promise<void> {
    const { clientId, actor } = requireRequestContext();

    await this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.charge.findFirst({
        where: { id, deletedAt: null },
        include: { partOf: { include: { charge: { select: { code: true } } } } },
      });
      if (!row) throw new NotFoundException("Charge not found.");

      // Deleting a charge another one is built from would silently change what
      // that composite bills, so it has to be untangled deliberately.
      const live = row.partOf.map((link) => link.charge.code);
      if (live.length > 0) {
        throw new BadRequestException(
          `${row.code} is a component of ${live.join(", ")}. Remove it there first.`,
        );
      }

      await tx.charge.update({ where: { id }, data: { deletedAt: new Date() } });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.charge.deleted",
          entity: "charge",
          entityId: id,
          metadata: { code: row.code, name: row.name },
        },
      });
    });
  }

  /**
   * Narrows the posted ids to charges that exist, dropping duplicates and
   * refusing the two shapes the checklist can produce but the data must not
   * hold: a charge under itself, and an id from another client that RLS would
   * have hidden from the list in the first place.
   */
  private async resolveComponents(
    tx: {
      charge: { findMany: (args: unknown) => Promise<{ id: string }[]> };
    },
    ids: string[],
    selfId: string | null,
  ): Promise<string[]> {
    const wanted = [...new Set(ids)].filter((id) => id !== selfId);
    if (wanted.length === 0) return [];

    const found = await tx.charge.findMany({
      where: { id: { in: wanted }, deletedAt: null },
      select: { id: true },
    });
    if (found.length !== wanted.length) {
      throw new BadRequestException("One of the selected charges no longer exists.");
    }

    return found.map((row) => row.id);
  }

  private toView(row: {
    id: string;
    code: string;
    name: string;
    chargeType: string;
    calculationBase: string;
    rate: { toString: () => string };
    applyFuel: boolean;
    applyTaxOnFuel: boolean;
    applyTax: boolean;
    hsnCode: string | null;
    sequence: number;
    applyFuelOnComponents: boolean;
    isActive: boolean;
    components: { component: { id: string; code: string; name: string } }[];
  }): ChargeView {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      chargeType: row.chargeType as ChargeType,
      calculationBase: row.calculationBase as ChargeCalculationBase,
      rate: row.rate.toString(),
      applyFuel: row.applyFuel,
      applyTaxOnFuel: row.applyTaxOnFuel,
      applyTax: row.applyTax,
      hsnCode: row.hsnCode,
      sequence: row.sequence,
      applyFuelOnComponents: row.applyFuelOnComponents,
      isActive: row.isActive,
      components: row.components
        .map((link) => link.component)
        .sort((a, b) => a.code.localeCompare(b.code)),
    };
  }
}
