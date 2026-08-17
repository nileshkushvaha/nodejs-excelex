#!/usr/bin/env bash
# ExcelEx — cross-client isolation proof.
#
# This is the executable form of implementation-plan §11 criterion 7 and the seed
# of the automated cross-client suite. Every assertion below must hold, in every
# environment, before Phase 1 is accepted.
#
# Run after `prisma migrate deploy` AND `prisma/sql/01-roles-and-rls.sql`.
#
#   POSTGRES_CONTAINER=docker-postgres-1  container to fall back into (see psql-env.sh)
#   DATABASE_MIGRATION_URL                owner connection (seeding)
#   DATABASE_URL                          excelex_app connection (the role under test)
#   DATABASE_JOBS_URL                     excelex_jobs connection
set -uo pipefail

OWNER="${DATABASE_MIGRATION_URL:-postgresql://excelex_owner:dev_owner_password@localhost:5432/excelex}"
APP="${DATABASE_URL:-postgresql://excelex_app:dev_app_password@localhost:5432/excelex}"
JOBS="${DATABASE_JOBS_URL:-postgresql://excelex_jobs:dev_jobs_password@localhost:5432/excelex}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./psql-env.sh
source "$HERE/psql-env.sh"

A=11111111-1111-4111-8111-111111111111
B=22222222-2222-4222-8222-222222222222

pass=0; fail=0
check() { # name expected actual
  if [[ "$2" == "$3" ]]; then printf "  \033[32mPASS\033[0m  %s\n" "$1"; pass=$((pass+1))
  else printf "  \033[31mFAIL\033[0m  %s\n        expected: %s\n        actual:   %s\n" "$1" "$2" "$3"; fail=$((fail+1)); fi
}

# Columns are snake_case in the database (@map in schema.prisma) precisely so that
# RLS policies, reporting views and raw SQL like this file need no quoting.
echo "Seeding two clients..."
pg "$OWNER" -q -v ON_ERROR_STOP=1 <<SQL || { echo "Seeding failed."; exit 1; }
INSERT INTO clients (id, slug, legal_name, status, updated_at) VALUES
  ('$A','excelex','ExcelEx Logistics','ACTIVE', now()),
  ('$B','globex','Globex Couriers','ACTIVE', now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO client_hostnames (id, client_id, hostname, is_primary) VALUES
  (gen_random_uuid(),'$A','localhost',true),
  (gen_random_uuid(),'$B','globex.localhost',true)
ON CONFLICT (hostname) DO NOTHING;
BEGIN;
  SELECT set_config('app.client_id','$A',true);
  INSERT INTO users (id, client_id, email, full_name, updated_at)
  VALUES (gen_random_uuid(),'$A','admin@excelex.in','ExcelEx Admin', now())
  ON CONFLICT (client_id,email) WHERE deleted_at IS NULL DO NOTHING;
COMMIT;
BEGIN;
  SELECT set_config('app.client_id','$B',true);
  INSERT INTO users (id, client_id, email, full_name, updated_at)
  VALUES (gen_random_uuid(),'$B','admin@globex.com','Globex Admin', now())
  ON CONFLICT (client_id,email) WHERE deleted_at IS NULL DO NOTHING;
COMMIT;
SQL

# Runs a query with a sealed client context, exactly as the application will:
# set_config(..., true) is transaction-local, so the context cannot outlive the
# transaction and leak onto the next request that borrows the pooled connection.
# $2 is a full aggregate + FROM clause, so it is wrapped in its own subselect —
# inlining it into coalesce() would place the FROM inside the function call.
# The R= prefix separates the answer from set_config's own result row.
as_client() { pg "$APP" -tA -q -c \
  "BEGIN; SELECT set_config('app.client_id','$1',true); SELECT 'R=' || coalesce((SELECT $2),'<none>'); COMMIT;" 2>&1 \
  | grep '^R=' | sed 's/^R=//'; }

denied() { # url query -> "denied" | raw result
  # The whole output is searched, not the first line: a statement preceded by
  # set_config emits its result row before the error we are asserting on.
  local out
  out=$(pg "$1" -tA -q -c "$2" 2>&1)
  case "$out" in *"permission denied"*) echo "denied";; *) echo "$out" | tr '\n' ' ' | sed 's/ *$//';; esac
}

echo ""
echo "Identity"
check "runtime role is not superuser" "excelex_app|off" \
  "$(pg "$APP" -tA -q -c "SELECT current_user||'|'||current_setting('is_superuser');")"
check "no runtime role holds SUPERUSER/BYPASSRLS/CREATEROLE/CREATEDB" "0" \
  "$(pg "$OWNER" -tA -q -c "SELECT count(*) FROM pg_roles WHERE rolname IN ('excelex_app','excelex_platform','excelex_jobs') AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb);")"

echo ""
echo "Coverage: the policies actually exist"
# Without this, a bare `prisma migrate reset` yields tables with no RLS and every
# assertion below would still pass on an unprotected database.
check "all 20 client tables have ENABLE + FORCE row level security" "20" \
  "$(pg "$OWNER" -tA -q -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('branches','users','user_branch_memberships','roles','user_roles','role_permissions','user_permissions','password_policies','password_history','security_settings','departments','designations','client_settings','product_types','product_groups','products','zones','sessions','invitations','audit_events') AND c.relrowsecurity AND c.relforcerowsecurity;")"
check "all 20 client tables carry the client_isolation policy" "20" \
  "$(pg "$OWNER" -tA -q -c "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname='client_isolation';")"

echo ""
echo "Barrier: platform tables unreachable from the client runtime"
for t in clients client_hostnames subscriptions platform_users platform_sessions \
         platform_user_mfa platform_audit_events support_access_sessions plans plan_limits \
         permissions; do
  check "excelex_app SELECT on $t is denied" "denied" "$(denied "$APP" "SELECT count(*) FROM $t;")"
done

echo ""
echo "Barrier: platform tables unreachable from the jobs runtime"
# excelex_jobs exists to sweep expired sessions, not to read the customer list.
for t in clients platform_users platform_sessions platform_user_mfa; do
  check "excelex_jobs SELECT on $t is denied" "denied" "$(denied "$JOBS" "SELECT count(*) FROM $t;")"
done

echo ""
echo "Barrier: row-level isolation between clients"
# Asserted as properties rather than as an exact row list: the proof must hold
# whatever else the development database happens to contain, or it starts
# failing for reasons that have nothing to do with isolation.
check "client A sees its own user"        "1" "$(as_client $A "count(*)::text FROM users WHERE email='admin@excelex.in'")"
check "client A cannot see client B's user" "0" "$(as_client $A "count(*)::text FROM users WHERE email='admin@globex.com'")"
check "every row client A sees belongs to client A" "0" \
  "$(as_client $A "count(*)::text FROM users WHERE client_id <> '$A'")"
check "client B sees its own user"        "1" "$(as_client $B "count(*)::text FROM users WHERE email='admin@globex.com'")"
check "every row client B sees belongs to client B" "0" \
  "$(as_client $B "count(*)::text FROM users WHERE client_id <> '$B'")"
check "no context reveals nothing"       "<none>" \
  "$(pg "$APP" -tA -q -c "SELECT coalesce(string_agg(email,','),'<none>') FROM users;")"
check "empty-string context fails closed, not with 22P02" "0" \
  "$(pg "$APP" -tA -q -c "BEGIN; SELECT set_config('app.client_id','',true); SELECT 'R='||count(*) FROM users; COMMIT;" 2>&1 | grep '^R=' | sed 's/^R=//')"
check "context does not survive its transaction" "<none>" \
  "$(pg "$APP" -tA -q -c "BEGIN; SELECT set_config('app.client_id','$A',true); COMMIT; SELECT coalesce(string_agg(email,','),'<none>') FROM users;" 2>&1 | tail -1)"

echo ""
echo "Barrier: cross-client WRITE rejected by WITH CHECK"
w=$(pg "$APP" -tA -q -c \
  "BEGIN; SELECT set_config('app.client_id','$A',true);
   INSERT INTO users (id,client_id,email,full_name,updated_at)
   VALUES (gen_random_uuid(),'$B','injected@a.com','Injected',now()); COMMIT;" 2>&1)
case "$w" in *"violates row-level security"*) r="rejected";; *) r="ACCEPTED — LEAK";; esac
check "client A cannot write a row owned by client B" "rejected" "$r"

u=$(pg "$APP" -tA -q -c \
  "BEGIN; SELECT set_config('app.client_id','$A',true);
   UPDATE users SET client_id='$B' WHERE email='admin@excelex.in'; COMMIT;" 2>&1)
case "$u" in *"violates row-level security"*) r="rejected";; *) r="ACCEPTED — LEAK";; esac
check "client A cannot hand its own row to client B" "rejected" "$r"

echo ""
echo "Barrier: the audit trail is append-only to every runtime role"
for role in "$APP" "$JOBS"; do
  who=$(pg "$role" -tA -q -c "SELECT current_user;")
  check "$who cannot UPDATE audit_events" "denied" \
    "$(denied "$role" "BEGIN; SELECT set_config('app.client_id','$A',true); UPDATE audit_events SET action='tampered'; COMMIT;")"
  check "$who cannot DELETE audit_events" "denied" \
    "$(denied "$role" "BEGIN; SELECT set_config('app.client_id','$A',true); DELETE FROM audit_events; COMMIT;")"
done

echo ""
echo "Documented residual risk (expected, not a failure)"
sc=$(pg "$OWNER" -tA -q -c "SELECT count(*) FROM users;" 2>/dev/null)
echo "  NOTE  owner under FORCE RLS sees $sc rows; a SUPERUSER still sees all."
echo "        FORCE does not constrain superusers — see ADR-0002 Consequences."

echo ""
printf "  %d passed, %d failed\n" "$pass" "$fail"
[[ $fail -eq 0 ]] || exit 1
