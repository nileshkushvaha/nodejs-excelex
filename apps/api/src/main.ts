import "dotenv/config";

import { Logger, VersioningType } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import { AppModule } from "./app.module";
import { ENVIRONMENT, loadEnvironment, type Environment } from "./core/config/environment";
import { createAppLogger } from "./core/observability/app-logger";
import { ErrorReporter } from "./core/observability/error-reporter";
import { installProcessHandlers } from "./core/observability/process-handlers";
import { createSentryReporter } from "./core/observability/sentry.reporter";

async function bootstrap(): Promise<void> {
  // The environment is read once here, before the container exists, because
  // the logger has to be chosen before anything logs. The container reads it
  // again through the ENVIRONMENT provider; both see the same process.env.
  const bootEnvironment = loadEnvironment();
  const logger = createAppLogger({
    json: bootEnvironment.NODE_ENV === "production",
    level: bootEnvironment.LOG_LEVEL ?? (bootEnvironment.NODE_ENV === "production" ? "log" : "debug"),
  });

  const app = await NestFactory.create(AppModule, { logger, bufferLogs: false });
  const environment = app.get<Environment>(ENVIRONMENT);

  // Error reporting: an adapter behind one seam, chosen by the environment.
  // Nothing else in the code base knows which vendor, or whether there is one.
  const reporter = app.get(ErrorReporter);
  if (environment.SENTRY_DSN) {
    reporter.use(
      createSentryReporter({
        dsn: environment.SENTRY_DSN,
        environment: environment.SENTRY_ENVIRONMENT ?? environment.NODE_ENV,
        release: environment.SENTRY_RELEASE,
        tracesSampleRate: environment.SENTRY_TRACES_SAMPLE_RATE,
      }),
    );
  } else {
    new Logger("Bootstrap").log("Error reporting disabled (SENTRY_DSN is not set); the log is the record.");
  }

  // Which address a request "comes from". Without this Express reports the
  // socket peer — nginx, or the web app's proxy — for every request, so
  // login history shows one address for everyone and a per-address limit
  // throttles the whole deployment at once. With it, X-Forwarded-For is
  // walked TRUST_PROXY_HOPS entries from the right, which is the one the
  // trusted proxies wrote rather than the one a caller could have supplied.
  if (environment.TRUST_PROXY_HEADERS) {
    app.getHttpAdapter().getInstance().set("trust proxy", environment.TRUST_PROXY_HOPS);
  }

  app.use(helmet({ contentSecurityPolicy: environment.NODE_ENV === "production" }));
  app.use(cookieParser());

  // Origin verification lives in AppModule.configure(), as Nest middleware,
  // so its refusal is rendered by the exception filter like any other error.

  // Prisma, Redis, the workers and the scheduler each close themselves in
  // onModuleDestroy — which only runs on SIGTERM if the hooks are enabled.
  // Without this a rolling deploy kills a worker mid-job.
  app.enableShutdownHooks();
  installProcessHandlers(app, reporter);

  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  // No global ValidationPipe: validation is Zod at the controller boundary (DEC-003),
  // sharing schemas with the web app rather than duplicating rules in decorators.

  // The browser only ever talks to the web app's origin, which proxies /api.
  // CORS is enabled for the development case where they are called directly.
  app.enableCors({ origin: environment.WEB_ORIGIN, credentials: true });

  await app.listen(environment.PORT);
  new Logger("Bootstrap").log(
    `API listening on http://localhost:${environment.PORT}/api/v1 (${environment.NODE_ENV})`,
  );
}

void bootstrap();
