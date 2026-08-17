import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 moved connection URLs out of schema.prisma into this file.
 *
 * Note which URL is used here: DATABASE_MIGRATION_URL, the schema OWNER.
 * The runtime connects as excelex_app / excelex_platform via DATABASE_URL and
 * never holds migration privileges — that separation is what makes row-level
 * security meaningful, because a table owner is exempt from RLS unless FORCE
 * is applied, and the migration role is deliberately the only owner.
 *
 * As of Prisma 7 the driver adapter needs no configuration here; migrations
 * work with driver adapters automatically.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    /**
     * Roles, grants and RLS policies are not part of the Prisma migration and
     * are destroyed by `migrate reset`, which recreates the tables without them.
     * Registering the security script as the seed makes Prisma re-apply it after
     * every reset, so the only way to obtain a migrated-but-unprotected database
     * is to bypass the tooling deliberately. The isolation proof asserts the
     * policies exist for the case where someone does.
     */
    seed: "bash scripts/apply-security.sh",
    /**
     * The shadow database is what makes drift detectable.
     *
     * Migrations here are generated with `migrate diff` and applied with
     * `migrate deploy`, because `migrate dev` refuses to run non-interactively.
     * That path diffs against the live database rather than the migration
     * history, so it cannot notice if the two have diverged. Replaying the
     * history into a scratch database and comparing it to the schema is the
     * check `migrate dev` would have done, and it is run explicitly:
     *
     *   pnpm run db:check-drift
     */
  },
  datasource: {
    url: env("DATABASE_MIGRATION_URL"),
    shadowDatabaseUrl: env("DATABASE_SHADOW_URL"),
  },
});
