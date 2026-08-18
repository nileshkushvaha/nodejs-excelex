import { Global, Module } from "@nestjs/common";

import { ENVIRONMENT, loadEnvironment } from "./config/environment";
import { PrismaService } from "./database/prisma.service";
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
  providers: [
    { provide: ENVIRONMENT, useFactory: () => loadEnvironment() },
    PrismaService,
    RedisService,
  ],
  exports: [ENVIRONMENT, PrismaService, RedisService],
})
export class CoreModule {}
