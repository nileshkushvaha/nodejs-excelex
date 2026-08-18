import {
  Body,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Controller,
} from "@nestjs/common";

import { Can } from "../auth/auth.guard";
import { OrganisationService } from "./organisation.service";
import {
  departmentSchema,
  designationSchema,
  parse,
} from "./masters.schemas";

/**
 * Departments.
 *
 * Split out of a 1,596-line controller that held every master. The path is
 * unchanged — this is the same routing table in a file somebody can read.
 */
@Controller({ path: "masters", version: "1" })
export class OrganisationController {
  constructor(
    private readonly organisation: OrganisationService,
  ) {}

  // ── Departments ──────────────────────────────────────────────────────────
  @Get("departments")
  @Can("department", "view")
  listDepartments() {
    return this.organisation.listDepartments();
  }

  @Post("departments")
  @Can("department", "create")
  createDepartment(@Body() body: unknown) {
    const data = parse(departmentSchema, body);
    return this.organisation.createDepartment({ ...data, description: data.description ?? null });
  }

  @Put("departments/:id")
  @Can("department", "update")
  @HttpCode(204)
  async updateDepartment(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown) {
    const data = parse(departmentSchema, body);
    await this.organisation.updateDepartment(id, { ...data, description: data.description ?? null });
  }

  @Delete("departments/:id")
  @Can("department", "delete")
  @HttpCode(204)
  async deleteDepartment(@Param("id", ParseUUIDPipe) id: string) {
    await this.organisation.deleteDepartment(id);
  }

  // ── Designations ─────────────────────────────────────────────────────────
  @Get("designations")
  @Can("designation", "view")
  listDesignations() {
    return this.organisation.listDesignations();
  }

  @Post("designations")
  @Can("designation", "create")
  createDesignation(@Body() body: unknown) {
    const data = parse(designationSchema, body);
    return this.organisation.createDesignation({
      ...data,
      description: data.description ?? null,
      departmentId: data.departmentId ?? null,
    });
  }

  @Put("designations/:id")
  @Can("designation", "update")
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
  @Can("designation", "delete")
  @HttpCode(204)
  async deleteDesignation(@Param("id", ParseUUIDPipe) id: string) {
    await this.organisation.deleteDesignation(id);
  }
}
