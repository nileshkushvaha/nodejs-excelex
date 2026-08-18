import { Controller, ForbiddenException, Get, Headers, Inject, Res, VERSION_NEUTRAL, Version } from "@nestjs/common";
import type { Response } from "express";

import { PublicRoute } from "../../auth/auth.guard";
import { ENVIRONMENT, type Environment } from "../config/environment";
import { metricsRefusalMessage, metricsScrapeAllowed } from "./metrics-auth";
import { MetricsService } from "./metrics.service";

/**
 * The Prometheus scrape target, at /api/metrics.
 *
 * Version-neutral because a scrape config is written once and a version in
 * its path is one more thing to update when v2 arrives. Public because a
 * scraper has no session — its credential is METRICS_TOKEN, checked here (see
 * metrics-auth.ts). It still passes host resolution like every other request:
 * a scrape from an unknown host is refused before it gets this far, which is
 * the same rule the health checks live under.
 */
@Controller()
export class MetricsController {
  constructor(
    @Inject(ENVIRONMENT) private readonly environment: Environment,
    private readonly metrics: MetricsService,
  ) {}

  @Get("metrics")
  @Version(VERSION_NEUTRAL)
  @PublicRoute()
  async scrape(
    @Headers("authorization") authorization: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const allowed = metricsScrapeAllowed({
      nodeEnv: this.environment.NODE_ENV,
      token: this.environment.METRICS_TOKEN,
      authorization,
    });
    if (!allowed) throw new ForbiddenException(metricsRefusalMessage(this.metrics.metricsProtected));

    const { body, contentType } = await this.metrics.exposition();
    response.setHeader("content-type", contentType);
    response.send(body);
  }
}
