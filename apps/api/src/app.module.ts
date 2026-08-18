import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { AccessController } from "./access/access.controller";
import { AccessService } from "./access/access.service";
import { AuthController } from "./auth/auth.controller";
import { AuthGuard } from "./auth/auth.guard";
import { ActorCache } from "./auth/actor-cache";
import { AuthService } from "./auth/auth.service";
import { LoginThrottleService } from "./auth/login-throttle.service";
import { PasswordResetService } from "./auth/password-reset.service";
import { SessionService } from "./auth/session.service";
import { ClientResolutionMiddleware } from "./core/context/client-resolution.middleware";
import { OriginCheckMiddleware } from "./core/http/origin-check.middleware";
import { CoreModule } from "./core/core.module";
import { DashboardController } from "./dashboard/dashboard.controller";
import { MailModule } from "./core/mail/mail.module";
import { NotificationModule } from "./core/notifications/notification.module";
import { JobsModule } from "./jobs/jobs.module";
import { SystemModule } from "./system/system.module";
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
import { MailSettingsService } from "./settings/mail-settings.service";
import { SecuritySettingsService } from "./settings/security-settings.service";
import { SettingsController } from "./settings/settings.controller";

@Module({
  imports: [CoreModule, JobsModule, MailModule, NotificationModule, SystemModule],
  controllers: [
    AccessController,
    AuthController,
    DashboardController,
    HealthController,
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
    SessionService,
    ActorCache,
    AuthService,
    LoginThrottleService,
    PasswordResetService,
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
    MailSettingsService,
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
    // Origin verification first, not SameSite: every client host shares one
    // registrable domain, so they are same-site with each other and SameSite
    // separates nothing between them. This is the CSRF control.
    consumer.apply(OriginCheckMiddleware, ClientResolutionMiddleware).forRoutes("*path");
  }
}
