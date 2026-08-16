#!/usr/bin/env bash
# Applies roles, grants and row-level security to an already-migrated database.
#
# This runs as the schema owner and must run after EVERY migration, including
# after `prisma migrate reset`. Prisma recreates tables without policies or
# grants; a database that has been migrated but not secured looks identical to a
# secured one until a client reads another client's rows. Section 2 of the SQL
# revokes default privileges precisely so a new table is unreachable rather than
# silently exposed, and section 7 raises rather than warns.
#
# The SQL is idempotent by construction, so re-running it is safe and expected.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./psql-env.sh
source "$HERE/psql-env.sh"

OWNER="${DATABASE_MIGRATION_URL:-postgresql://excelex_owner:dev_owner_password@localhost:5432/excelex}"

pg "$OWNER" -v ON_ERROR_STOP=1 -q -f - < "$HERE/../prisma/sql/01-roles-and-rls.sql"
echo "Database security applied."
