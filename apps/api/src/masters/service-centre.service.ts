import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { requireRequestContext } from "../core/context/request-context";
import { PrismaService } from "../core/database/prisma.service";

export interface ServiceCentreView {
  id: string;
  code: string;
  name: string;
  subName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  addressLine3: string | null;
  addressLine4: string | null;
  pinCode: string | null;
  countryCode: string;
  stateCode: string | null;
  telephone: string | null;
  email: string | null;
  gstin: string | null;
  gstTelephone: string | null;
  pan: string | null;
  icnNo: string | null;
  stNo: string | null;
  terms: string[];
  bankName: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
  bankAddress: string | null;
  ifsc: string | null;
  micr: string | null;
  invoicePrefix: string | null;
  invoiceLastNo: number;
  invoiceSuffix: string | null;
  freeFormPrefix: string | null;
  freeFormLastNo: number;
  freeFormSuffix: string | null;
  debitNotePrefix: string | null;
  debitNoteLastNo: number;
  debitNoteSuffix: string | null;
  creditNotePrefix: string | null;
  creditNoteLastNo: number;
  creditNoteSuffix: string | null;
  receiptLastNo: number;
  isActive: boolean;
  companyLogoKey: string | null;
  signatoryLogoKey: string | null;
  destination: { id: string; code: string; name: string } | null;
}

export type ServiceCentreInput = Omit<
  ServiceCentreView,
  "id" | "destination" | "companyLogoKey" | "signatoryLogoKey"
> & { destinationId: string | null };

/**
 * Service centres — the legal entities that invoice.
 *
 * A client runs several: two of them can bill from the same branch under
 * different registrations. That is why GST, bank details and invoice numbering
 * live here rather than on the client, and why an invoice has to carry the
 * details of the centre that issued it rather than the account it belongs to.
 */
@Injectable()
export class ServiceCentreService {
  constructor(private readonly prisma: PrismaService) {}

  async list(search?: string): Promise<ServiceCentreView[]> {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const rows = await tx.serviceCentre.findMany({
        where: {
          deletedAt: null,
          ...(search?.trim()
            ? {
                OR: [
                  { code: { contains: search.trim(), mode: "insensitive" as const } },
                  { name: { contains: search.trim(), mode: "insensitive" as const } },
                ],
              }
            : {}),
        },
        include: { destination: true },
        orderBy: { code: "asc" },
      });

      return rows.map(toView);
    });
  }

  async create(input: ServiceCentreInput): Promise<{ id: string }> {
    const { clientId, actor } = requireRequestContext();
    const code = input.code.trim().toUpperCase();

    return this.prisma.forClient(clientId!, async (tx) => {
      const clash = await tx.serviceCentre.findFirst({ where: { code, deletedAt: null } });
      if (clash) {
        throw new BadRequestException(`A service centre with code "${code}" already exists.`);
      }

      await this.assertReferences(tx, input);

      const row = await tx.serviceCentre.create({
        data: { clientId: clientId!, ...normalise(input), code },
      });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.service_centre.created",
          entity: "service_centre",
          entityId: row.id,
          metadata: { code, name: input.name },
        },
      });

      return { id: row.id };
    });
  }

  async update(id: string, input: ServiceCentreInput): Promise<void> {
    const { clientId, actor } = requireRequestContext();
    const code = input.code.trim().toUpperCase();

    await this.prisma.forClient(clientId!, async (tx) => {
      const before = await tx.serviceCentre.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException("Service centre not found.");

      const clash = await tx.serviceCentre.findFirst({
        where: { code, deletedAt: null, NOT: { id } },
      });
      if (clash) throw new BadRequestException("Another service centre already uses that code.");

      await this.assertReferences(tx, input);

      // A counter may only move forward. Editing it downward would hand the next
      // invoice a number that has already been issued, and two documents sharing
      // a number is a statutory problem rather than a tidiness one.
      for (const [field, label] of [
        ["invoiceLastNo", "invoice"],
        ["freeFormLastNo", "free-form invoice"],
        ["debitNoteLastNo", "debit note"],
        ["creditNoteLastNo", "credit note"],
        ["receiptLastNo", "receipt"],
      ] as const) {
        if (input[field] < before[field]) {
          throw new BadRequestException(
            `The last ${label} number cannot go backwards — it is at ${before[field]}, and lowering it would reissue numbers already used.`,
          );
        }
      }

      await tx.serviceCentre.update({ where: { id }, data: { ...normalise(input), code } });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.service_centre.updated",
          entity: "service_centre",
          entityId: id,
          metadata: {
            from: { code: before.code, name: before.name, gstin: before.gstin },
            to: { code, name: input.name, gstin: input.gstin },
          },
        },
      });
    });
  }

  async remove(id: string): Promise<void> {
    const { clientId, actor } = requireRequestContext();

    await this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.serviceCentre.findFirst({ where: { id, deletedAt: null } });
      if (!row) throw new NotFoundException("Service centre not found.");

      await tx.serviceCentre.update({ where: { id }, data: { deletedAt: new Date() } });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.service_centre.deleted",
          entity: "service_centre",
          entityId: id,
          // The counters are recorded on the way out: a centre that is deleted
          // and recreated must not silently restart its invoice numbering.
          metadata: { code: row.code, name: row.name, invoiceLastNo: row.invoiceLastNo },
        },
      });
    });
  }

  private async assertReferences(
    tx: {
      destination: { findFirst: (args: unknown) => Promise<unknown> };
      $queryRaw: <T>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
    },
    input: ServiceCentreInput,
  ): Promise<void> {
    if (input.destinationId) {
      const destination = await tx.destination.findFirst({
        where: { id: input.destinationId, deletedAt: null },
      });
      if (!destination) throw new BadRequestException("That destination does not exist.");
    }

    if (input.stateCode) {
      const states = await tx.$queryRaw<Array<{ code: string; gst_code: string | null }>>`
        SELECT code, gst_code FROM public.list_states(${input.countryCode})
      `;
      const state = states.find((row) => row.code === input.stateCode);
      if (!state) {
        throw new BadRequestException(
          `"${input.stateCode}" is not a subdivision of ${input.countryCode}.`,
        );
      }

      // Same cross-field check as the client's own registration: a GSTIN's
      // first two digits are the GST code of the state that issued it, and a
      // mismatch only surfaces when a tax authority rejects the invoice.
      if (input.gstin && state.gst_code && !input.gstin.startsWith(state.gst_code)) {
        throw new BadRequestException(
          `That GSTIN begins with ${input.gstin.slice(0, 2)}, which is not the GST code for the selected state (${state.gst_code}).`,
        );
      }
    }
  }
}

/** Trims the ten term lines to the ten the database will accept. */
function normalise(input: ServiceCentreInput) {
  const { destinationId, ...rest } = input;
  return {
    ...rest,
    destinationId,
    terms: input.terms.slice(0, 10).map((line) => line.trim()),
    gstin: input.gstin?.toUpperCase() ?? null,
    pan: input.pan?.toUpperCase() ?? null,
    ifsc: input.ifsc?.toUpperCase() ?? null,
  };
}

function toView(row: Record<string, unknown>): ServiceCentreView {
  const destination = row["destination"] as { id: string; code: string; name: string } | null;

  return {
    ...(row as unknown as ServiceCentreView),
    terms: (row["terms"] as string[]) ?? [],
    destination: destination
      ? { id: destination.id, code: destination.code, name: destination.name }
      : null,
  };
}
