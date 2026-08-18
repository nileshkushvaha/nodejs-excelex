import { Global, MiddlewareConsumer, Module, NestModule } from "@nestjs/common";

import { MetricsController } from "./metrics.controller";
import { metricsMiddleware } from "./metrics.middleware";
import { MetricsService } from "./metrics.service";

/**
 * Collection and exposition of process metrics.
 *
 * Its own module rather than a provider in CoreModule, because it has a
 * controller and a middleware to register, and `configure()` belongs to the
 * module that owns the middleware. Global, like CoreModule which imports it,
 * so the worker and the performance screen can inject MetricsService without
 * another import line — re-exporting a module from a global one does not make
 * its providers global; only the @Global() here does.
 *
 * The middleware is applied to every route, including 404s and the health
 * checks: the request count on the screen should be the count a load
 * balancer would see.
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule implements NestModule {
  constructor(private readonly metrics: MetricsService) {}

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(metricsMiddleware(this.metrics)).forRoutes("*path");
  }
}
