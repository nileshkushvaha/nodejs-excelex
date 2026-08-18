import { BadRequestException, Injectable } from "@nestjs/common";
import { applyIncrease, type Rounding } from "@excelex/rating";

import { requireRequestContext } from "../core/context/request-context";
import { PrismaService } from "../core/database/prisma.service";

/** Which tariffs to copy, and what to change about them. */
export interface RateCopyRequest {
  readonly from: {
    customerId?: string | null;
    originId?: string | null;
    destinationId?: string | null;
    productId?: string | null;
    zoneId?: string | null;
    vendor?: string | null;
    service?: string | null;
    countryCode?: string | null;
    effectiveFrom?: string | null;
  };
  /** Only the fields being changed. Anything omitted is carried across. */
  readonly to: {
    customerId?: string | null;
    originId?: string | null;
    destinationId?: string | null;
    productId?: string | null;
    zoneId?: string | null;
    vendor?: string | null;
    service?: string | null;
    countryCode?: string | null;
    effectiveFrom: string;
  };
  readonly percentageIncrease: string;
  readonly rounding: Rounding;
}

export interface RateCopyReport {
  readonly mode: "preview" | "commit";
  readonly matched: number;
  readonly created: number;
  readonly replaced: number;
  readonly lines: number;
  readonly aborted: boolean;
  readonly conflicts: string[];
  readonly examples: Array<{ lane: string; before: string; after: string }>;
}

/**
 * Copying a tariff, which is how an annual increase is actually applied.
 *
 * Last year's card, plus six percent, effective from April — done as a bulk
 * operation because a courier has hundreds of lanes and nobody retypes them.
 *
 * Two things make this safe enough to run on a live tariff. It previews: the
 * report says how many rates match, how many already exist at the target, and
 * what three of them would cost before and after. And it refuses to copy a
 * rate onto itself — a copy whose target key equals its source would double
 * a tariff or overwrite the thing being read, and neither is recoverable.
 */
@Injectable()
export class RateCopyService {
  constructor(private readonly prisma: PrismaService) {}

  async run(request: RateCopyRequest, mode: "preview" | "commit"): Promise<RateCopyReport> {
    const { clientId, actor } = requireRequestContext();

    const percent = request.percentageIncrease.trim() || "0";
    if (!/^\d+(\.\d+)?$/.test(percent) || Number(percent) > 100) {
      throw new BadRequestException("The increase must be a percentage between 0 and 100.");
    }

    const target = request.to.effectiveFrom;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) {
      throw new BadRequestException("Choose the date the copied rates take effect from.");
    }

    return this.prisma.forClient(clientId!, async (tx) => {
      const where: Record<string, unknown> = { deletedAt: null };
      for (const [field, value] of Object.entries(request.from)) {
        if (value === undefined || value === null || value === "") continue;
        where[field] = field === "effectiveFrom" ? new Date(`${value}T00:00:00Z`) : value;
      }

      const sources = await tx.rateCard.findMany({
        where: where as never,
        include: { lines: true, origin: true, destination: true, customer: true },
      });

      const conflicts: string[] = [];
      const examples: RateCopyReport["examples"] = [];
      let lines = 0;
      let replaced = 0;

      // The key a copied rate would land on, so a collision is reported
      // before it happens rather than discovered afterwards.
      const keyOf = (card: Record<string, unknown>) =>
        JSON.stringify([
          card["customerId"], card["originId"], card["destinationId"], card["productId"],
          card["zoneId"], card["vendor"], card["service"], card["countryCode"],
          card["effectiveFrom"], card["unit"],
        ]);

      const plans: Array<{ data: Record<string, unknown>; lines: Array<Record<string, unknown>>; key: string }> = [];

      for (const source of sources) {
        const data: Record<string, unknown> = {
          kind: source.kind,
          customerId: request.to.customerId ?? source.customerId,
          originId: request.to.originId ?? source.originId,
          destinationId: request.to.destinationId ?? source.destinationId,
          productId: request.to.productId ?? source.productId,
          zoneId: request.to.zoneId ?? source.zoneId,
          originZoneId: source.originZoneId,
          vendor: request.to.vendor ?? source.vendor,
          service: request.to.service ?? source.service,
          countryCode: request.to.countryCode ?? source.countryCode,
          contractNo: source.contractNo,
          effectiveFrom: new Date(`${target}T00:00:00Z`),
          effectiveTo: null,
          unit: source.unit,
          days: source.days,
          awbCharge:
            source.awbCharge === null
              ? null
              : applyIncrease(String(source.awbCharge), percent, request.rounding),
          priority: source.priority,
          isActive: true,
        };

        const key = keyOf({ ...data, effectiveFrom: target });

        // Copying a rate onto itself would either double it or overwrite the
        // row being read from. Refused outright rather than reported.
        if (key === keyOf({ ...source, effectiveFrom: source.effectiveFrom.toISOString().slice(0, 10) })) {
          throw new BadRequestException(
            "That copy would write onto the rates it is reading. Change the date, the customer or the lane.",
          );
        }

        const copied = source.lines.map((line) => ({
          lineType: line.lineType,
          weight: String(line.weight),
          rate: applyIncrease(String(line.rate), percent, request.rounding),
        }));
        lines += copied.length;

        const lane = `${source.origin?.code ?? "Any"} → ${source.destination?.code ?? "Any"}`;
        if (examples.length < 3 && copied[0]) {
          examples.push({
            lane: `${source.customer?.code ?? "Standard"} ${lane}`,
            before: String(source.lines[0]!.rate),
            after: copied[0].rate,
          });
        }

        plans.push({ data, lines: copied, key });
      }

      const existing = await tx.rateCard.findMany({
        where: { deletedAt: null, effectiveFrom: new Date(`${target}T00:00:00Z`) },
        select: {
          id: true, customerId: true, originId: true, destinationId: true, productId: true,
          zoneId: true, vendor: true, service: true, countryCode: true, effectiveFrom: true, unit: true,
        },
      });

      const existingByKey = new Map(
        existing.map((card) => [
          JSON.stringify([
            card.customerId, card.originId, card.destinationId, card.productId, card.zoneId,
            card.vendor, card.service, card.countryCode,
            card.effectiveFrom.toISOString().slice(0, 10), card.unit,
          ]),
          card.id,
        ]),
      );

      for (const plan of plans) {
        if (existingByKey.has(plan.key)) {
          replaced += 1;
          conflicts.push(String(plan.data["contractNo"] ?? "") || `${target} — a rate already exists here`);
        }
      }

      if (mode === "commit") {
        for (const plan of plans) {
          const current = existingByKey.get(plan.key);

          if (current) {
            // Replaced rather than added to, for the same reason the import
            // replaces: running the copy twice must not double a tariff.
            await tx.rateLine.deleteMany({ where: { rateCardId: current } });
            await tx.rateCard.update({ where: { id: current }, data: plan.data as never });
            await tx.rateLine.createMany({
              data: plan.lines.map((line) => ({ clientId: clientId!, rateCardId: current, ...line })) as never,
            });
            continue;
          }

          const card = await tx.rateCard.create({ data: { clientId: clientId!, ...plan.data } as never });
          await tx.rateLine.createMany({
            data: plan.lines.map((line) => ({ clientId: clientId!, rateCardId: card.id, ...line })) as never,
          });
        }

        await tx.auditEvent.create({
          data: {
            clientId: clientId!,
            actorId: actor?.userId ?? null,
            action: "masters.rate.copied",
            entity: "rate_card",
            metadata: {
              matched: plans.length,
              lines,
              percent,
              rounding: request.rounding,
              effectiveFrom: target,
            },
          },
        });
      }

      return {
        mode,
        matched: plans.length,
        created: plans.length - replaced,
        replaced,
        lines,
        aborted: false,
        conflicts: conflicts.slice(0, 20),
        examples,
      };
    });
  }
}
