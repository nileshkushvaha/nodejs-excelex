import { MiddlewareConsumer, Module, NestModule, OnModuleInit } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { AccessController } from "./access/access.controller";
import { AccessService } from "./access/access.service";
import { AuthController } from "./auth/auth.controller";
import { AuthGuard } from "./auth/auth.guard";
import { ActorCache } from "./auth/actor-cache";
import { AuthService } from "./auth/auth.service";
import { SessionService } from "./auth/session.service";
import { ENVIRONMENT, loadEnvironment } from "./core/config/environment";
import { ClientResolutionMiddleware } from "./core/context/client-resolution.middleware";
import { PrismaService } from "./core/database/prisma.service";
import { DashboardController } from "./dashboard/dashboard.controller";
import { JobsController } from "./jobs/jobs.controller";
import { JobRegistry, registerHeartbeat } from "./jobs/job.registry";
import { JobService } from "./jobs/job.service";
import { QueueService } from "./jobs/queue.service";
import { WorkerService } from "./jobs/worker.service";
import { HealthController } from "./health/health.controller";
import { OrganisationService } from "./masters/organisation.service";
import { DestinationImportService } from "./masters/import/destination-import.service";
import { ProductImportService } from "./masters/import/product-import.service";
import { DestinationService } from "./masters/destination.service";
import { ProductService } from "./masters/product.service";
import { ChargeService } from "./masters/charge.service";
import { DataController } from "./masters/data.controller";
import { AccountGroupsController } from "./masters/account-groups.controller";
import { ChargesController } from "./masters/charges.controller";
import { ConsigneesController } from "./masters/consignees.controller";
import { CustomersController } from "./masters/customers.controller";
import { DestinationsController } from "./masters/destinations.controller";
import { OrganisationController } from "./masters/organisation.controller";
import { ProductsController } from "./masters/products.controller";
import { ReferenceController } from "./masters/reference.controller";
import { SalesExecutivesController } from "./masters/sales-executives.controller";
import { ServiceCentresController } from "./masters/service-centres.controller";
import { ShippersController } from "./masters/shippers.controller";
import { ZonesController } from "./masters/zones.controller";
import { MasterIoService } from "./masters/import/master-io.service";
import { RatesController } from "./masters/rates.controller";
import { RateCopyService } from "./masters/rate-copy.service";
import { RateService } from "./masters/rate.service";
import { RateImportService } from "./masters/import/rate-import.service";
import { LookupsController } from "./masters/lookups.controller";
import { LookupService } from "./masters/lookup.service";
import { PinCodeService } from "./masters/pin-code.service";
import { AccountGroupService } from "./masters/account-group.service";
import { ConsigneeService } from "./masters/consignee.service";
import { ShipperService } from "./masters/shipper.service";
import { CustomerImportService } from "./masters/import/customer-import.service";
import { CustomerDetailService } from "./masters/customer-detail.service";
import { CustomerService } from "./masters/customer.service";
import { SalesExecutiveService } from "./masters/sales-executive.service";
import { ServiceCentreService } from "./masters/service-centre.service";
import { ReferenceService } from "./masters/reference.service";
import { ZoneService } from "./masters/zone.service";
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
    JobsController,
    AccountGroupsController,
    ChargesController,
    ConsigneesController,
    CustomersController,
    DestinationsController,
    OrganisationController,
    ProductsController,
    ReferenceController,
    SalesExecutivesController,
    ServiceCentresController,
    ShippersController,
    ZonesController,
    LookupsController,
    RatesController,
    ProfileController,
    SettingsController,
    DataController,
  ],
  providers: [
    { provide: ENVIRONMENT, useFactory: () => loadEnvironment() },
    PrismaService,
    SessionService,
    ActorCache,
    QueueService,
    JobService,
    JobRegistry,
    WorkerService,
    AuthService,
    AccessService,
    ReferenceService,
    OrganisationService,
    ProductService,
    ProductImportService,
    ZoneService,
    DestinationService,
    DestinationImportService,
    ServiceCentreService,
    SalesExecutiveService,
    CustomerService,
    CustomerDetailService,
    CustomerImportService,
    ConsigneeService,
    ShipperService,
    AccountGroupService,
    MasterIoService,
    LookupService,
    PinCodeService,
    RateService,
    RateImportService,
    RateCopyService,
    ChargeService,
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
export class AppModule implements NestModule, OnModuleInit {
  constructor(private readonly jobs: JobRegistry) {}

  /**
   * The handlers that are not owned by a feature.
   *
   * Registered here rather than in the registry's constructor so the list of
   * what this system can run in the background is readable in one place.
   */
  onModuleInit(): void {
    registerHeartbeat(this.jobs);
  }

  configure(consumer: MiddlewareConsumer): void {
    // Every route, including health checks: the host allowlist is a transport
    // concern and a request for an unknown host should not reach any handler.
    consumer.apply(ClientResolutionMiddleware).forRoutes("*path");
  }
}
