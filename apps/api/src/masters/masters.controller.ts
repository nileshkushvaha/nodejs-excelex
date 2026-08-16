import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { z } from "zod";

import { RequirePermission } from "../auth/auth.guard";
import { OrganisationService } from "./organisation.service";
import { ReferenceService } from "./reference.service";

const departmentSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "A department needs a code.")
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, "A code may use letters, numbers and hyphens only."),
  name: z.string().trim().min(2, "A department needs a name.").max(80),
  description: z.string().trim().max(300).nullish(),
  isActive: z.coerce.boolean().default(true),
});

const designationSchema = departmentSchema.extend({
  departmentId: z.string().uuid().nullish(),
  /** Seniority, low to high. Bounded so the ordering stays meaningful. */
  level: z.coerce.number().int().min(0).max(1000).default(0),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(result.error.issues.map((issue) => issue.message));
  }
  return result.data;
}

@Controller({ path: "masters", version: "1" })
export class MastersController {
  constructor(
    private readonly reference: ReferenceService,
    private readonly organisation: OrganisationService,
  ) {}

  // ── Reference data ───────────────────────────────────────────────────────
  // No permission required. Every address form in the product needs these, and
  // gating them would mean an operator who can book a shipment cannot name the
  // country it is going to. They are public facts, and read-only to everyone.
  @Get("countries")
  countries() {
    return this.reference.countries();
  }

  @Get("states")
  states(@Query("country") country?: string) {
    const code = (country ?? "IN").trim();
    if (!/^[A-Za-z]{2}$/.test(code)) {
      throw new BadRequestException("Country must be a two-letter ISO code.");
    }
    return this.reference.states(code.toUpperCase());
  }

  // ── Departments ──────────────────────────────────────────────────────────
  @Get("departments")
  @RequirePermission("masters.organisation.view")
  listDepartments() {
    return this.organisation.listDepartments();
  }

  @Post("departments")
  @RequirePermission("masters.organisation.manage")
  createDepartment(@Body() body: unknown) {
    const data = parse(departmentSchema, body);
    return this.organisation.createDepartment({ ...data, description: data.description ?? null });
  }

  @Put("departments/:id")
  @RequirePermission("masters.organisation.manage")
  @HttpCode(204)
  async updateDepartment(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    const data = parse(departmentSchema, body);
    await this.organisation.updateDepartment(id, { ...data, description: data.description ?? null });
  }

  @Delete("departments/:id")
  @RequirePermission("masters.organisation.manage")
  @HttpCode(204)
  async deleteDepartment(@Param("id", ParseUUIDPipe) id: string) {
    await this.organisation.deleteDepartment(id);
  }

  // ── Designations ─────────────────────────────────────────────────────────
  @Get("designations")
  @RequirePermission("masters.organisation.view")
  listDesignations() {
    return this.organisation.listDesignations();
  }

  @Post("designations")
  @RequirePermission("masters.organisation.manage")
  createDesignation(@Body() body: unknown) {
    const data = parse(designationSchema, body);
    return this.organisation.createDesignation({
      ...data,
      description: data.description ?? null,
      departmentId: data.departmentId ?? null,
    });
  }

  @Put("designations/:id")
  @RequirePermission("masters.organisation.manage")
  @HttpCode(204)
  async updateDesignation(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    const data = parse(designationSchema, body);
    await this.organisation.updateDesignation(id, {
      ...data,
      description: data.description ?? null,
      departmentId: data.departmentId ?? null,
    });
  }

  @Delete("designations/:id")
  @RequirePermission("masters.organisation.manage")
  @HttpCode(204)
  async deleteDesignation(@Param("id", ParseUUIDPipe) id: string) {
    await this.organisation.deleteDesignation(id);
  }
}
