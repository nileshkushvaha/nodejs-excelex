import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { AccessController } from "./access/access.controller";
import { AccessService } from "./access/access.service";
import { AuthController } from "./auth/auth.controller";
import { AuthGuard } from "./auth/auth.guard";
import { AuthService } from "./auth/auth.service";
import { SessionService } from "./auth/session.service";
import { ENVIRONMENT, loadEnvironment } from "./core/config/environment";
import { ClientResolutionMiddleware } from "./core/context/client-resolution.middleware";
import { PrismaService } from "./core/database/prisma.service";
import { DashboardController } from "./dashboard/dashboard.controller";
import { HealthController } from "./health/health.controller";
import { MastersController } from "./masters/masters.controller";
import { OrganisationService } from "./masters/organisation.service";
import { ReferenceService } from "./masters/reference.service";
import { ProfileController } from "./profile/profile.controller";
import { ProfileService } from "./profile/profile.service";
import { PasswordPolicyService } from "./settings/password-policy.service";
import { ClientSettingsService } from "./settings/client-settings.service";
import { SecuritySettingsService } from "./settings/security-settings.service";
import { SettingsController } from "./settings/settings.controller";

@Module({
  controllers: [
    AccessController,
    AuthController,
    DashboardController,
    HealthController,
    MastersController,
    ProfileController,
    SettingsController,
  ],
  providers: [
    { provide: ENVIRONMENT, useFactory: () => loadEnvironment() },
    PrismaService,
    SessionService,
    AuthService,
    AccessService,
    ReferenceService,
    OrganisationService,
    ProfileService,
    PasswordPolicyService,
    SecuritySettingsService,
    ClientSettingsService,
    // Authentication is global and opted out of per route. A new endpoint is
    // protected by default; forgetting the decorator locks it rather than
    // opening it.
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Every route, including health checks: the host allowlist is a transport
    // concern and a request for an unknown host should not reach any handler.
    consumer.apply(ClientResolutionMiddleware).forRoutes("*path");
  }
}
