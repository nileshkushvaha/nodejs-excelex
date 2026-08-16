import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { requireRequestContext } from "../core/context/request-context";
import { PrismaService } from "../core/database/prisma.service";

export interface DepartmentView {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  designationCount: number;
}

export interface DesignationView {
  id: string;
  code: string;
  name: string;
  description: string | null;
  level: number;
  isActive: boolean;
  department: { id: string; code: string; name: string } | null;
}

export interface DepartmentInput {
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface DesignationInput extends DepartmentInput {
  departmentId: string | null;
  level: number;
}

/**
 * Departments and designations — a client's own organisation structure.
 *
 * Deletes are soft throughout. A designation is referenced by staff records the
 * moment those exist, and a hard delete would either fail on a foreign key or
 * silently orphan them; deactivation is the reversible form of the same intent
 * and is what an administrator almost always means.
 */
@Injectable()
export class OrganisationService {
  constructor(private readonly prisma: PrismaService) {}

  async listDepartments(): Promise<DepartmentView[]> {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const rows = await tx.department.findMany({
        where: { deletedAt: null },
        include: { _count: { select: { designations: true } } },
        orderBy: { code: "asc" },
      });

      return rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        description: row.description,
        isActive: row.isActive,
        designationCount: row._count.designations,
      }));
    });
  }

  async createDepartment(input: DepartmentInput): Promise<{ id: string }> {
    const { clientId, actor } = requireRequestContext();
    const code = input.code.trim().toUpperCase();

    return this.prisma.forClient(clientId!, async (tx) => {
      // deletedAt filtered: a soft-deleted department is a tombstone, not a code
      // reservation. The unique index is partial for the same reason.
      const clash = await tx.department.findFirst({
        where: { OR: [{ code }, { name: input.name }], deletedAt: null },
      });
      if (clash) {
        throw new BadRequestException(
          clash.code === code
            ? `A department with code "${code}" already exists.`
            : `A department named "${input.name}" already exists.`,
        );
      }

      const row = await tx.department.create({
        data: {
          clientId: clientId!,
          code,
          name: input.name,
          description: input.description,
          isActive: input.isActive,
        },
      });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.department.created",
          entity: "department",
          entityId: row.id,
          metadata: { code, name: input.name },
        },
      });

      return { id: row.id };
    });
  }

  async updateDepartment(id: string, input: DepartmentInput): Promise<void> {
    const { clientId, actor } = requireRequestContext();
    const code = input.code.trim().toUpperCase();

    await this.prisma.forClient(clientId!, async (tx) => {
      const before = await tx.department.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException("Department not found.");

      const clash = await tx.department.findFirst({
        where: { OR: [{ code }, { name: input.name }], deletedAt: null, NOT: { id } },
      });
      if (clash) throw new BadRequestException("Another department already uses that code or name.");

      await tx.department.update({
        where: { id },
        data: {
          code,
          name: input.name,
          description: input.description,
          isActive: input.isActive,
        },
      });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.department.updated",
          entity: "department",
          entityId: id,
          metadata: { from: { code: before.code, name: before.name }, to: { code, name: input.name } },
        },
      });
    });
  }

  async deleteDepartment(id: string): Promise<void> {
    const { clientId, actor } = requireRequestContext();

    await this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.department.findFirst({
        where: { id, deletedAt: null },
        include: { _count: { select: { designations: true } } },
      });
      if (!row) throw new NotFoundException("Department not found.");

      // Refused rather than cascaded. Removing a department should not silently
      // take its job titles with it — and the titles may be assigned to staff.
      if (row._count.designations > 0) {
        throw new BadRequestException(
          `${row._count.designations} designation(s) still belong to this department. Move or remove them first.`,
        );
      }

      await tx.department.update({ where: { id }, data: { deletedAt: new Date() } });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.department.deleted",
          entity: "department",
          entityId: id,
          metadata: { code: row.code, name: row.name },
        },
      });
    });
  }

  async listDesignations(): Promise<DesignationView[]> {
    const { clientId } = requireRequestContext();

    return this.prisma.forClient(clientId!, async (tx) => {
      const rows = await tx.designation.findMany({
        where: { deletedAt: null },
        include: { department: true },
        // Seniority first, so the list reads like an org chart rather than an
        // alphabet.
        orderBy: [{ level: "desc" }, { name: "asc" }],
      });

      return rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        description: row.description,
        level: row.level,
        isActive: row.isActive,
        department: row.department
          ? { id: row.department.id, code: row.department.code, name: row.department.name }
          : null,
      }));
    });
  }

  async createDesignation(input: DesignationInput): Promise<{ id: string }> {
    const { clientId, actor } = requireRequestContext();
    const code = input.code.trim().toUpperCase();

    return this.prisma.forClient(clientId!, async (tx) => {
      const clash = await tx.designation.findFirst({ where: { code, deletedAt: null } });
      if (clash) throw new BadRequestException(`A designation with code "${code}" already exists.`);

      if (input.departmentId) {
        const department = await tx.department.findFirst({
          where: { id: input.departmentId, deletedAt: null },
        });
        if (!department) throw new BadRequestException("That department does not exist.");
      }

      const row = await tx.designation.create({
        data: {
          clientId: clientId!,
          departmentId: input.departmentId,
          code,
          name: input.name,
          description: input.description,
          level: input.level,
          isActive: input.isActive,
        },
      });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.designation.created",
          entity: "designation",
          entityId: row.id,
          metadata: { code, name: input.name, level: input.level },
        },
      });

      return { id: row.id };
    });
  }

  async updateDesignation(id: string, input: DesignationInput): Promise<void> {
    const { clientId, actor } = requireRequestContext();
    const code = input.code.trim().toUpperCase();

    await this.prisma.forClient(clientId!, async (tx) => {
      const before = await tx.designation.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException("Designation not found.");

      const clash = await tx.designation.findFirst({
        where: { code, deletedAt: null, NOT: { id } },
      });
      if (clash) throw new BadRequestException("Another designation already uses that code.");

      if (input.departmentId) {
        const department = await tx.department.findFirst({
          where: { id: input.departmentId, deletedAt: null },
        });
        if (!department) throw new BadRequestException("That department does not exist.");
      }

      await tx.designation.update({
        where: { id },
        data: {
          departmentId: input.departmentId,
          code,
          name: input.name,
          description: input.description,
          level: input.level,
          isActive: input.isActive,
        },
      });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.designation.updated",
          entity: "designation",
          entityId: id,
          metadata: { from: { code: before.code, name: before.name }, to: { code, name: input.name } },
        },
      });
    });
  }

  async deleteDesignation(id: string): Promise<void> {
    const { clientId, actor } = requireRequestContext();

    await this.prisma.forClient(clientId!, async (tx) => {
      const row = await tx.designation.findFirst({ where: { id, deletedAt: null } });
      if (!row) throw new NotFoundException("Designation not found.");

      await tx.designation.update({ where: { id }, data: { deletedAt: new Date() } });

      await tx.auditEvent.create({
        data: {
          clientId: clientId!,
          actorId: actor?.userId ?? null,
          action: "masters.designation.deleted",
          entity: "designation",
          entityId: id,
          metadata: { code: row.code, name: row.name },
        },
      });
    });
  }
}
