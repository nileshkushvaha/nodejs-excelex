// The API loads its environment in main.ts, which these tests do not run.
// Without this the module graph fails to construct and every test reports a
// missing app rather than a missing variable.
import "dotenv/config";

import { INestApplication, VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";

import { AppModule } from "../../src/app.module";
import { AllExceptionsFilter } from "../../src/core/http/exception.filter";

/**
 * The application, against a real database.
 *
 * Real rather than mocked on purpose: the properties worth testing here are
 * the ones only Postgres can enforce — row-level security, the constraints
 * written by hand into migrations, and the fact that a client's request
 * cannot see another client's rows. A mocked Prisma would assert that the
 * code calls the functions the code calls.
 *
 * Everything is created through the API where an endpoint exists, so the
 * tests exercise the same path a browser does.
 */
export async function startApi(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });

  await app.init();
  return app;
}

/**
 * Both hosts the isolation proof seeds, so a test can act as either client.
 *
 * The host is how a client is resolved — there is no client id in a request
 * body anywhere — which is itself the property being tested: a caller cannot
 * ask for another client's data because there is no field in which to ask.
 */
export const HOSTS = {
  a: "localhost",
  b: "globex.localhost",
} as const;
