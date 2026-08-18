import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { z } from "zod";

import { RequirePermission } from "../../auth/auth.guard";
import { parseOrThrow } from "../../core/errors/validation";
import {
  CACHE_KEY_PATTERN,
  CACHE_NAMESPACE_NAMES,
  type CacheNamespace,
} from "../../core/cache/cache.namespaces";
import { CacheManagerService } from "./cache-manager.service";

const namespaceSchema = z.enum(CACHE_NAMESPACE_NAMES as [CacheNamespace, ...CacheNamespace[]], {
  message: "That is not a cache namespace.",
});
const keySchema = z
  .string()
  .regex(CACHE_KEY_PATTERN, "A cache key is letters, digits, dot, dash or underscore only.");
const keysQuerySchema = z.object({
  search: z.string().max(100).default(""),
  cursor: z.string().regex(/^\d*$/, "The cursor is not one this API issued.").default("0"),
});

/**
 * The cache manager's routes.
 *
 * Every namespace and key passes through the same two schemas before it
 * reaches Redis. That is the whole security argument for this controller: a
 * caller can name a namespace from the closed list and a key made of plain
 * characters, and nothing else — so no request can compose a pattern, cross a
 * colon into another client's prefix, or reach the queue's keys.
 */
@Controller({ path: "system/cache", version: "1" })
export class CacheController {
  constructor(private readonly manager: CacheManagerService) {}

  private namespace(value: string): CacheNamespace {
    return parseOrThrow(namespaceSchema, value);
  }

  private key(value: string): string {
    return parseOrThrow(keySchema, value);
  }

  @Get()
  @RequirePermission("system.cache.view")
  overview() {
    return this.manager.overview();
  }

  @Post("flush")
  @HttpCode(200)
  @RequirePermission("system.cache.manage")
  flushAll() {
    return this.manager.flushAll();
  }

  @Post("stats/reset")
  @HttpCode(200)
  @RequirePermission("system.cache.manage")
  async resetStats() {
    await this.manager.resetStats();
    return { ok: true };
  }

  @Post("platform/:namespace/flush")
  @HttpCode(200)
  @RequirePermission("system.cache.manage")
  flushPlatform(@Param("namespace") namespace: string) {
    return this.manager.flushPlatform(this.namespace(namespace));
  }

  @Get(":namespace/keys")
  @RequirePermission("system.cache.view")
  keys(@Param("namespace") namespace: string, @Query() query: Record<string, string>) {
    const parsed = parseOrThrow(keysQuerySchema, query);
    return this.manager.keys(this.namespace(namespace), parsed.search, parsed.cursor || "0");
  }

  @Get(":namespace/keys/:key")
  @RequirePermission("system.cache.view")
  inspect(@Param("namespace") namespace: string, @Param("key") key: string) {
    return this.manager.inspect(this.namespace(namespace), this.key(key));
  }

  @Delete(":namespace")
  @RequirePermission("system.cache.manage")
  flushNamespace(@Param("namespace") namespace: string) {
    return this.manager.flushNamespace(this.namespace(namespace));
  }

  @Delete(":namespace/keys/:key")
  @RequirePermission("system.cache.manage")
  deleteKey(@Param("namespace") namespace: string, @Param("key") key: string) {
    return this.manager.deleteKey(this.namespace(namespace), this.key(key));
  }
}
