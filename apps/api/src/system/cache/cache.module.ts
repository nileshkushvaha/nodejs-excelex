import { Module } from "@nestjs/common";

import { CacheManagerService } from "./cache-manager.service";
import { CacheController } from "./cache.controller";

/**
 * The cache manager. CacheService itself is global (CoreModule) because
 * features consume it; this module is only the operator's window onto it.
 *
 * ActorCache is deliberately not listed here: it is registered once in the
 * root module and the guard holds that instance. Providing it again would
 * give this module a second, empty map that always reports zero, so the
 * manager service reaches the root instance through ModuleRef instead.
 */
@Module({
  controllers: [CacheController],
  providers: [CacheManagerService],
})
export class CacheModule {}
