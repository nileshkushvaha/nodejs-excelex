import { Controller, Get, Query } from "@nestjs/common";
import { z } from "zod";

import { RequirePermission } from "../../auth/auth.guard";
import type { WindowMinutes } from "../../core/metrics/rolling-window";
import { PerformanceService } from "./performance.service";
import { parseOrThrow } from "../../core/errors/validation";

const windowSchema = z.object({
  window: z
    .enum(["5", "15", "60"], { message: "window must be 5, 15 or 60 (minutes)." })
    .default("15")
    .transform((value) => Number(value) as WindowMinutes),
});

const routesSchema = windowSchema.extend({
  sort: z
    .enum(["p95", "count", "errors"], { message: "sort must be p95, count or errors." })
    .default("p95"),
});

/**
 * The application performance screen, read-only.
 *
 * Three reads rather than one, because they refresh at different rates: the
 * overview every ten seconds, the full route table on demand, the health
 * strip whenever someone worries.
 */
@Controller({ path: "system/performance", version: "1" })
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}

  @Get()
  @RequirePermission("system.performance.view")
  overview(@Query() query: Record<string, string>) {
    const parsed = parseOrThrow(windowSchema, query);
    return this.performance.overview(parsed.window);
  }

  @Get("routes")
  @RequirePermission("system.performance.view")
  routes(@Query() query: Record<string, string>) {
    const parsed = parseOrThrow(routesSchema, query);
    return {
      window: parsed.window,
      sort: parsed.sort,
      routes: this.performance.routes(parsed.window, parsed.sort),
    };
  }

  @Get("health")
  @RequirePermission("system.performance.view")
  health() {
    return this.performance.health();
  }

  /**
   * The most recent server-side failures on this instance: when, which
   * route, which code, and the reference to quote — never the message or
   * the stack, which live in the log under the same reference.
   */
  @Get("errors")
  @RequirePermission("system.performance.view")
  errors(@Query() query: Record<string, string>) {
    const { limit } = parseOrThrow(errorsQuerySchema, query);
    return { errors: this.performance.recentErrors(limit) };
  }
}

const errorsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
