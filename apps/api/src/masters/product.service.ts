import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { requireRequestContext } from "../core/context/request-context";
import { PrismaService } from "../core/database/prisma.service";

export interface ClassificationView {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  productCount: number;
}

export interface ClassificationInput {
  code: string;
  name: string;
  isActive: boolean;
}

export interface ProductView {
  id: string;
  code: string;
  name: string;
  service: string | null;
  contentKind: "DOX" | "NDOX";
  fuelCharge: boolean;
  gstReverse: boolean;
  isActive: boolean;
  productType: { id: string; name: string } | null;
  productGroup: { id: string; name: string } | null;
}

export interface ProductInput {
  code: string;
  name: string;
  productTypeId: string | null;
  productGroupId: string | null;
  service: string | null;
  contentKind: "DOX" | "NDOX";
  fuelCharge: boolean;
  gstReverse: boolean;
  isActive: boolean;
}

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) {}

  async listTypes(): Promise<ClassificationView[]> {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const rows = await tx.productType.findMany({
        where: { deletedAt: null },
        include: { _count: { select: { products: true } } },
        orderBy: { name: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        isActive: row.isActive,
        productCount: row._count.products,
      }));
    });
  }

  async listGroups(): Promise<ClassificationView[]> {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const rows = await tx.productGroup.findMany({
        where: { deletedAt: null },
        include: { _count: { select: { products: true } } },
        orderBy: { name: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        isActive: row.isActive,
        productCount: row._count.products,
      }));
    });
  }

  async typeById(id: string): Promise<ClassificationView | null> {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.productType.findFirst({
        where: { id, deletedAt: null },
        include: { _count: { select: { products: true } } },
      });
      if (!row) return null;
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        isActive: row.isActive,
        productCount: row._count.products,
      };
    });
  }

  async createType(input: ClassificationInput): Promise<{ id: string }> {
    const { clientId, actor } = requireRequestContext();
    const code = input.code.trim().toUpperCase();

    return this.prisma.forClient(clientId!, async (tx) => {
      const clash = await tx.productType.findFirst({ where: { code, deletedAt: null } });
      if (clash) throw new BadRequestException(`A product type with code "${code}" already exists.`);

      const row = await tx.productType.create({
        data: { clientId: clientId!, code, name: input.name.trim(), isActive: input.isActive },
      });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.product_type.created",
          entity: "product_type",
          entityId: row.id,
          metadata: { code, name: input.name.trim() },
        },
      });

      return { id: row.id };
    });
  }

  async updateType(id: string, input: ClassificationInput): Promise<void> {
    const { clientId, actor } = requireRequestContext();
    const code = input.code.trim().toUpperCase();

    await this.prisma.forClient(clientId!, async (tx) => {
      const before = await tx.productType.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException("Product type not found.");

      const clash = await tx.productType.findFirst({
        where: { code, deletedAt: null, NOT: { id } },
      });
      if (clash) throw new BadRequestException("Another product type already uses that code.");

      await tx.productType.update({
        where: { id },
        data: { code, name: input.name.trim(), isActive: input.isActive },
      });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.product_type.updated",
          entity: "product_type",
          entityId: id,
          metadata: {
            from: { code: before.code, name: before.name },
            to: { code, name: input.name.trim() },
          },
        },
      });
    });
  }

  async removeType(id: string): Promise<void> {
    const { clientId, actor } = requireRequestContext();

    await this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.productType.findFirst({
        where: { id, deletedAt: null },
        include: { _count: { select: { products: true } } },
      });
      if (!row) throw new NotFoundException("Product type not found.");

      // Soft-deleting a type that products point at would leave those rows
      // reading from a record nothing lists. Deactivate it instead — that
      // keeps it off new products without rewriting history.
      if (row._count.products > 0) {
        throw new BadRequestException(
          `${row.name} is used by ${row._count.products} product(s). Deactivate it instead.`,
        );
      }

      await tx.productType.update({ where: { id }, data: { deletedAt: new Date() } });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.product_type.deleted",
          entity: "product_type",
          entityId: id,
          metadata: { code: row.code, name: row.name },
        },
      });
    });
  }

  async listProducts(): Promise<ProductView[]> {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const rows = await tx.product.findMany({
        where: { deletedAt: null },
        include: { productType: true, productGroup: true },
        orderBy: { code: "asc" },
      });

      return rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        service: row.service,
        contentKind: row.contentKind,
        fuelCharge: row.fuelCharge,
        gstReverse: row.gstReverse,
        isActive: row.isActive,
        productType: row.productType ? { id: row.productType.id, name: row.productType.name } : null,
        productGroup: row.productGroup
          ? { id: row.productGroup.id, name: row.productGroup.name }
          : null,
      }));
    });
  }

  async createProduct(input: ProductInput): Promise<{ id: string }> {
    const { clientId, actor } = requireRequestContext();
    const code = input.code.trim().toUpperCase();

    return this.prisma.forClient(clientId!, async (tx) => {
      const clash = await tx.product.findFirst({ where: { code, deletedAt: null } });
      if (clash) throw new BadRequestException(`A product with code "${code}" already exists.`);

      await this.assertClassifications(tx, input);

      const row = await tx.product.create({
        data: { clientId: clientId!, ...input, code },
      });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.product.created",
          entity: "product",
          entityId: row.id,
          metadata: { code, name: input.name, contentKind: input.contentKind },
        },
      });

      return { id: row.id };
    });
  }

  async updateProduct(id: string, input: ProductInput): Promise<void> {
    const { clientId, actor } = requireRequestContext();
    const code = input.code.trim().toUpperCase();

    await this.prisma.forClient(clientId!, async (tx) => {
      const before = await tx.product.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException("Product not found.");

      const clash = await tx.product.findFirst({ where: { code, deletedAt: null, NOT: { id } } });
      if (clash) throw new BadRequestException("Another product already uses that code.");

      await this.assertClassifications(tx, input);

      await tx.product.update({ where: { id }, data: { ...input, code } });

      // Recorded as a diff rather than a snapshot. A product's rating flags are
      // what an invoice dispute turns on, and "changed" answers nothing.
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const key of ["code", "name", "contentKind", "fuelCharge", "gstReverse", "isActive"] as const) {
        const next = key === "code" ? code : input[key];
        if (before[key] !== next) changes[key] = { from: before[key], to: next };
      }

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.product.updated",
          entity: "product",
          entityId: id,
          metadata: changes,
        },
      });
    });
  }

  async deleteProduct(id: string): Promise<void> {
    const { clientId, actor } = requireRequestContext();

    await this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.product.findFirst({ where: { id, deletedAt: null } });
      if (!row) throw new NotFoundException("Product not found.");

      await tx.product.update({ where: { id }, data: { deletedAt: new Date() } });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.product.deleted",
          entity: "product",
          entityId: id,
          metadata: { code: row.code, name: row.name },
        },
      });
    });
  }

  /**
   * A classification must exist and belong to this client.
   *
   * The composite foreign keys already make a cross-client reference
   * impossible, so this is about the message: a rejected foreign key surfaces
   * as a constraint violation nobody outside the database can read.
   */
  private async assertClassifications(
    tx: {
      productType: { findFirst: (args: unknown) => Promise<unknown> };
      productGroup: { findFirst: (args: unknown) => Promise<unknown> };
    },
    input: ProductInput,
  ): Promise<void> {
    if (input.productTypeId) {
      const type = await tx.productType.findFirst({
        where: { id: input.productTypeId, deletedAt: null },
      });
      if (!type) throw new BadRequestException("That product type does not exist.");
    }

    if (input.productGroupId) {
      const group = await tx.productGroup.findFirst({
        where: { id: input.productGroupId, deletedAt: null },
      });
      if (!group) throw new BadRequestException("That group type does not exist.");
    }
  }
}
