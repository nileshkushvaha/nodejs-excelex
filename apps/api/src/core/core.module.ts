import { Global, Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";

import { CacheService } from "./cache/cache.service";
import { ENVIRONMENT, loadEnvironment } from "./config/environment";
import { AllExceptionsFilter } from "./http/exception.filter";
import { PrismaService } from "./database/prisma.service";
import { MetricsModule } from "./metrics/metrics.module";
import { ErrorReporter } from "./observability/error-reporter";
import { ExceptionRecorder } from "./observability/exception-recorder";
import { RateLimitGuard } from "./rate-limit/rate-limit.guard";
import { RateLimiterService } from "./rate-limit/rate-limiter.service";
import { RedisService } from "./redis/redis.service";

/**
 * The handles every feature needs and none should construct.
 *
 * Global so a feature module can inject the environment, the database and
 * Redis without importing anything — the alternative is every module
 * re-importing the same three lines, or worse, one of them creating its own
 * connection because the import was forgotten.
 */
@Global()
@Module({
  imports: [MetricsModule],
  providers: [
    { provide: ENVIRONMENT, useFactory: () => loadEnvironment() },
    // Registered here rather than with useGlobalFilters() so it is built by
    // the container and can be given the metrics service and the environment.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // First guard registered, so it runs before authentication: a flood is
    // refused before it costs a session lookup.
    { provide: APP_GUARD, useClass: RateLimitGuard },
    RateLimiterService,
    ErrorReporter,
    ExceptionRecorder,
    PrismaService,
    RedisService,
    CacheService,
  ],
  exports: [ENVIRONMENT, PrismaService, RedisService, CacheService, RateLimiterService, ErrorReporter, ExceptionRecorder],
})
export class CoreModule {}
