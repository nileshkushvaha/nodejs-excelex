import "dotenv/config";

import { Logger, VersioningType } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import { AppModule } from "./app.module";
import { ENVIRONMENT, type Environment } from "./core/config/environment";
import { OriginCheckMiddleware } from "./core/http/origin-check.middleware";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const environment = app.get<Environment>(ENVIRONMENT);

  app.use(helmet({ contentSecurityPolicy: environment.NODE_ENV === "production" }));
  app.use(cookieParser());

  // Origin verification, not SameSite. Every client host shares one registrable
  // domain, so they are same-site with each other and SameSite separates nothing
  // between them. This is the CSRF control.
  app.use(new OriginCheckMiddleware(environment).handler());

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
