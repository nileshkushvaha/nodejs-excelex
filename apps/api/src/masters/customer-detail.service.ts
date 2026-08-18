import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { requireRequestContext } from "../core/context/request-context";
import { PrismaService } from "../core/database/prisma.service";

export interface FuelSurchargeInput {
  fromDate: string;
  toDate: string;
  vendor: string | null;
  productId: string | null;
  destinationId: string | null;
  service: string | null;
  percentage: string;
}

export interface CustomerChargeInput {
  chargeId: string;
  fromDate: string;
  toDate: string;
  vendor: string | null;
  service: string | null;
  productId: string | null;
  originId: string | null;
  destinationId: string | null;
  valueType: "PERCENTAGE" | "AMOUNT";
  value: string;
  minimumValue: string | null;
}

export interface VolumetricInput {
  productId: string | null;
  vendor: string | null;
  service: string | null;
  cft: string;
  centimetreDivide: string;
  inchDivide: string;
}

export interface ContactInput {
  contactType: string;
  fromDate: string;
  name: string;
  designation: string | null;
  email: string | null;
  mobile: string;
  landline: string | null;
  extension: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  addressLine3: string | null;
  pinCode: string;
  city: string | null;
  stateCode: string | null;
  countryCode: string;
  remark: string | null;
  passportNo: string | null;
  aadhaar: string | null;
  gstin: string | null;
  pan: string | null;
  iecNo: string | null;
  adCode: string | null;
  lutNo: string | null;
  defaultShipper: boolean;
}

const date = (value: string) => new Date(`${value}T00:00:00Z`);

/**
 * The four lists that hang off a customer.
 *
 * One service rather than four because they are the same shape of thing —
 * child rows keyed by customer, soft-deleted, audited — and four files of
 * near-identical CRUD would be four places to fix the same bug.
 *
 * Every method takes the customer id and checks it first. That check is not
 * ceremony: without it a request could hang a rate off a customer id from
 * another client, and RLS would allow the write because the child row's own
 * client_id is correct.
 */
@Injectable()
export class CustomerDetailService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertCustomer(tx: { customer: { findFirst: (a: unknown) => Promise<unknown> } }, customerId: string) {
    const customer = await tx.customer.findFirst({
      where: { id: customerId, deletedAt: null },
    } as never);
    if (!customer) throw new NotFoundException("Customer not found.");
  }

  // ── Fuel surcharges ──────────────────────────────────────────────────────
  async listFuelSurcharges(customerId: string) {
    const { clientId } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => {
      await this.assertCustomer(tx as never, customerId);
      const rows = await tx.customerFuelSurcharge.findMany({
        where: { customerId, deletedAt: null },
        include: { product: true, destination: true },
        orderBy: [{ fromDate: "desc" }],
      });
      return rows.map((row) => ({
        id: row.id,
        fromDate: row.fromDate.toISOString().slice(0, 10),
        toDate: row.toDate.toISOString().slice(0, 10),
        vendor: row.vendor,
        service: row.service,
        percentage: String(row.percentage),
        product: row.product ? { id: row.product.id, code: row.product.code, name: row.product.name } : null,
        destination: row.destination
          ? { id: row.destination.id, code: row.destination.code, name: row.destination.name }
          : null,
      }));
    });
  }

  async saveFuelSurcharge(customerId: string, id: string | null, input: FuelSurchargeInput) {
    const { clientId, actor } = requireRequestContext();
    if (input.toDate < input.fromDate) {
      throw new BadRequestException("The end date cannot fall before the start date.");
    }

    return this.prisma.forClient(clientId!, async (tx) => {
      await this.assertCustomer(tx as never, customerId);

      const data = {
        fromDate: date(input.fromDate),
        toDate: date(input.toDate),
        vendor: input.vendor,
        productId: input.productId,
        destinationId: input.destinationId,
        service: input.service,
        percentage: input.percentage,
      };

      const row = id
        ? await tx.customerFuelSurcharge.update({ where: { id }, data })
        : await tx.customerFuelSurcharge.create({ data: { clientId: clientId!, customerId, ...data } });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: id ? "masters.customer_fuel_surcharge.updated" : "masters.customer_fuel_surcharge.created",
          entity: "customer_fuel_surcharge",
          entityId: row.id,
          metadata: { customerId, percentage: input.percentage },
        },
      });

      return { id: row.id };
    });
  }

  // ── Other charges ────────────────────────────────────────────────────────
  async listCharges(customerId: string) {
    const { clientId } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => {
      await this.assertCustomer(tx as never, customerId);
      const rows = await tx.customerCharge.findMany({
        where: { customerId, deletedAt: null },
        include: { charge: true, product: true, origin: true, destination: true },
        orderBy: [{ fromDate: "desc" }],
      });
      return rows.map((row) => ({
        id: row.id,
        charge: { id: row.charge.id, code: row.charge.code, name: row.charge.name },
        fromDate: row.fromDate.toISOString().slice(0, 10),
        toDate: row.toDate.toISOString().slice(0, 10),
        vendor: row.vendor,
        service: row.service,
        valueType: row.valueType,
        value: String(row.value),
        minimumValue: row.minimumValue === null ? null : String(row.minimumValue),
        product: row.product ? { id: row.product.id, code: row.product.code, name: row.product.name } : null,
        origin: row.origin ? { id: row.origin.id, code: row.origin.code, name: row.origin.name } : null,
        destination: row.destination
          ? { id: row.destination.id, code: row.destination.code, name: row.destination.name }
          : null,
      }));
    });
  }

  async saveCharge(customerId: string, id: string | null, input: CustomerChargeInput) {
    const { clientId, actor } = requireRequestContext();
    if (input.toDate < input.fromDate) {
      throw new BadRequestException("The end date cannot fall before the start date.");
    }
    // A percentage above 100 on a charge that multiplies freight is a typo
    // every time, and it reaches an invoice before anyone notices.
    if (input.valueType === "PERCENTAGE" && Number(input.value) > 100) {
      throw new BadRequestException("A percentage charge cannot exceed 100.");
    }

    return this.prisma.forClient(clientId!, async (tx) => {
      await this.assertCustomer(tx as never, customerId);

      const charge = await tx.charge.findFirst({ where: { id: input.chargeId, deletedAt: null } });
      if (!charge) throw new BadRequestException("That charge is not in the charge master.");

      const data = {
        chargeId: input.chargeId,
        fromDate: date(input.fromDate),
        toDate: date(input.toDate),
        vendor: input.vendor,
        service: input.service,
        productId: input.productId,
        originId: input.originId,
        destinationId: input.destinationId,
        valueType: input.valueType,
        value: input.value,
        minimumValue: input.minimumValue,
      };

      const row = id
        ? await tx.customerCharge.update({ where: { id }, data })
        : await tx.customerCharge.create({ data: { clientId: clientId!, customerId, ...data } });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: id ? "masters.customer_charge.updated" : "masters.customer_charge.created",
          entity: "customer_charge",
          entityId: row.id,
          metadata: { customerId, charge: charge.code, value: input.value },
        },
      });

      return { id: row.id };
    });
  }

  // ── Volumetrics ──────────────────────────────────────────────────────────
  async listVolumetrics(customerId: string) {
    const { clientId } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => {
      await this.assertCustomer(tx as never, customerId);
      const rows = await tx.customerVolumetric.findMany({
        where: { customerId, deletedAt: null },
        include: { product: true },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        vendor: row.vendor,
        service: row.service,
        cft: String(row.cft),
        centimetreDivide: String(row.centimetreDivide),
        inchDivide: String(row.inchDivide),
        product: row.product ? { id: row.product.id, code: row.product.code, name: row.product.name } : null,
      }));
    });
  }

  async saveVolumetric(customerId: string, id: string | null, input: VolumetricInput) {
    const { clientId, actor } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      await this.assertCustomer(tx as never, customerId);

      const data = {
        productId: input.productId,
        vendor: input.vendor,
        service: input.service,
        cft: input.cft,
        centimetreDivide: input.centimetreDivide,
        inchDivide: input.inchDivide,
      };

      const row = id
        ? await tx.customerVolumetric.update({ where: { id }, data })
        : await tx.customerVolumetric.create({ data: { clientId: clientId!, customerId, ...data } });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: id ? "masters.customer_volumetric.updated" : "masters.customer_volumetric.created",
          entity: "customer_volumetric",
          entityId: row.id,
          metadata: { customerId, cft: input.cft },
        },
      });

      return { id: row.id };
    });
  }

  // ── Contacts ─────────────────────────────────────────────────────────────
  async listContacts(customerId: string) {
    const { clientId } = requireRequestContext();
    return this.prisma.forClient(clientId!, async (tx) => {
      await this.assertCustomer(tx as never, customerId);
      const rows = await tx.customerContact.findMany({
        where: { customerId, deletedAt: null },
        orderBy: [{ defaultShipper: "desc" }, { name: "asc" }],
      });
      return rows.map((row) => ({
        ...row,
        fromDate: row.fromDate.toISOString().slice(0, 10),
        createdAt: undefined,
        updatedAt: undefined,
        deletedAt: undefined,
      }));
    });
  }

  async saveContact(customerId: string, id: string | null, input: ContactInput) {
    const { clientId, actor } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      await this.assertCustomer(tx as never, customerId);

      const data = { ...input, fromDate: date(input.fromDate) };

      const row = id
        ? await tx.customerContact.update({ where: { id }, data })
        : await tx.customerContact.create({ data: { clientId: clientId!, customerId, ...data } });

      // Exactly one default shipper per customer. Enforced by clearing the
      // others rather than by rejecting the save: the person ticking the box
      // means "this one now", not "tell me which one it was before".
      if (input.defaultShipper) {
        await tx.customerContact.updateMany({
          where: { customerId, deletedAt: null, NOT: { id: row.id } },
          data: { defaultShipper: false },
        });
      }

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: id ? "masters.customer_contact.updated" : "masters.customer_contact.created",
          entity: "customer_contact",
          entityId: row.id,
          metadata: { customerId, name: input.name },
        },
      });

      return { id: row.id };
    });
  }

  /** Soft-deletes one child row of any of the four kinds. */
  async remove(kind: "fuel" | "charge" | "volumetric" | "contact", customerId: string, id: string) {
    const { clientId, actor } = requireRequestContext();

    await this.prisma.forClient(clientId!, async (tx) => {
      await this.assertCustomer(tx as never, customerId);
      const deletedAt = new Date();

      // A switch rather than a lookup table: the four delegates have
      // different argument types, and a union of them is not callable.
      switch (kind) {
        case "fuel": {
          const found = await tx.customerFuelSurcharge.findFirst({ where: { id, customerId, deletedAt: null } });
          if (!found) throw new NotFoundException("That row no longer exists.");
          await tx.customerFuelSurcharge.update({ where: { id }, data: { deletedAt } });
          break;
        }
        case "charge": {
          const found = await tx.customerCharge.findFirst({ where: { id, customerId, deletedAt: null } });
          if (!found) throw new NotFoundException("That row no longer exists.");
          await tx.customerCharge.update({ where: { id }, data: { deletedAt } });
          break;
        }
        case "volumetric": {
          const found = await tx.customerVolumetric.findFirst({ where: { id, customerId, deletedAt: null } });
          if (!found) throw new NotFoundException("That row no longer exists.");
          await tx.customerVolumetric.update({ where: { id }, data: { deletedAt } });
          break;
        }
        case "contact": {
          const found = await tx.customerContact.findFirst({ where: { id, customerId, deletedAt: null } });
          if (!found) throw new NotFoundException("That row no longer exists.");
          await tx.customerContact.update({ where: { id }, data: { deletedAt } });
          break;
        }
      }

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: `masters.customer_${kind}.deleted`,
          entity: `customer_${kind}`,
          entityId: id,
          metadata: { customerId },
        },
      });
    });
  }
}
