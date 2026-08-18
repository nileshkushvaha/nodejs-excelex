import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";

import { RequirePermission } from "../../auth/auth.guard";
import { parseOrThrow } from "../../core/errors/validation";
import { readPageRequest } from "../../masters/paged";
import { ExceptionsService } from "./exceptions.service";

const fingerprintSchema = z.string().regex(/^[a-f0-9]{32}$/u, "Not an exception group.");

@Controller({ path: "system/exceptions", version: "1" })
export class ExceptionsController {
  constructor(private readonly exceptions: ExceptionsService) {}

  @Get()
  @RequirePermission("system.exception.view")
  list(@Query() query: Record<string, string>) {
    return this.exceptions.groups({
      ...readPageRequest(query),
      status: query["status"],
      source: query["source"],
      search: query["search"],
    });
  }

  @Get("summary")
  @RequirePermission("system.exception.view")
  summary() {
    return this.exceptions.summary();
  }

  @Get(":fingerprint")
  @RequirePermission("system.exception.view")
  detail(@Param("fingerprint") fingerprint: string) {
    return this.exceptions.detail(parseOrThrow(fingerprintSchema, fingerprint));
  }

  @Post(":fingerprint/resolve")
  @RequirePermission("system.exception.manage")
  @HttpCode(200)
  resolve(@Param("fingerprint") fingerprint: string) {
    return this.exceptions.setStatus(parseOrThrow(fingerprintSchema, fingerprint), "RESOLVED");
  }

  @Post(":fingerprint/ignore")
  @RequirePermission("system.exception.manage")
  @HttpCode(200)
  ignore(@Param("fingerprint") fingerprint: string) {
    return this.exceptions.setStatus(parseOrThrow(fingerprintSchema, fingerprint), "IGNORED");
  }

  @Post(":fingerprint/reopen")
  @RequirePermission("system.exception.manage")
  @HttpCode(200)
  reopen(@Param("fingerprint") fingerprint: string) {
    return this.exceptions.setStatus(parseOrThrow(fingerprintSchema, fingerprint), "OPEN");
  }
}
