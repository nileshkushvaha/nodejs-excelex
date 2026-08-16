import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";

import { PublicRoute } from "../auth/auth.guard";
import { PrismaService } from "../core/database/prisma.service";

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: dependency-free by design, so a database blip cannot cause a restart loop. */
  @Get("healthz")
  @PublicRoute()
  live(): { status: "ok" } {
    return { status: "ok" };
  }

  /** Readiness: actually touches the database, because that is what "ready" means here. */
  @Get("readyz")
  @PublicRoute()
  async ready(): Promise<{ status: "ok"; checks: Record<string, "ok"> }> {
    try {
      await this.prisma.platform.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: "degraded", checks: { database: "failed" } });
    }

    return { status: "ok", checks: { database: "ok" } };
  }
}
