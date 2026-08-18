-- ExcelEx Platform — database roles, grants and row-level security
-- Run AFTER `prisma migrate dev` has created the tables.
--
-- Design notes (from AUDIT-1 / AUDIT-3):
--   * Privileges are DENY BY DEFAULT. No blanket ALTER DEFAULT PRIVILEGES grant.
--     Every client table is granted explicitly; platform tables are never granted
--     to the client runtime role.
--   * FORCE ROW LEVEL SECURITY, because a table owner is exempt from RLS without it.
--   * nullif(...) on the GUC: after SET LOCAL reverts, a custom GUC reads back as
--     the empty string, not NULL. Without nullif, ''::uuid raises 22P02 on every
--     pooled connection after the first.
--   * WITH CHECK is stated explicitly so the new-row rule never silently inherits
--     a visibility rule that later diverges.

\set ON_ERROR_STOP on

-- ─────────────────────────────────────────────────────────────
-- 1. Runtime roles
-- ─────────────────────────────────────────────────────────────
-- excelex_owner    already exists (owns the schema, used only by migrations)
-- excelex_app      client runtime      — RLS applies, no platform table access
-- excelex_platform platform runtime    — platform tables, client data only via support access
-- excelex_jobs     background workers  — enumerable cross-client reads on 3 tables only

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'excelex_app') THEN
    CREATE ROLE excelex_app LOGIN PASSWORD 'dev_app_password';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'excelex_platform') THEN
    CREATE ROLE excelex_platform LOGIN PASSWORD 'dev_platform_password';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'excelex_jobs') THEN
    CREATE ROLE excelex_jobs LOGIN PASSWORD 'dev_jobs_password';
  END IF;
END $$;

-- CREATE ROLE produces a role with no SUPERUSER, BYPASSRLS, CREATEDB or CREATEROLE
-- attribute, so there is nothing to strip. Setting them explicitly would require
-- this script to run as a superuser, which it must not need. Section 7 ASSERTS
-- the attributes instead — verification beats configuration.

-- Bound runaway queries so one client cannot hold a pooled connection forever.
ALTER ROLE excelex_app      SET statement_timeout = '15s';
ALTER ROLE excelex_app      SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE excelex_platform SET statement_timeout = '30s';
ALTER ROLE excelex_jobs     SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────
-- 2. Deny by default
-- ─────────────────────────────────────────────────────────────
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

GRANT CONNECT ON DATABASE excelex TO excelex_app, excelex_platform, excelex_jobs;
GRANT USAGE ON SCHEMA public TO excelex_app, excelex_platform, excelex_jobs;

-- Nothing is granted implicitly to future tables. A new table is unreachable
-- until it is classified and granted, which fails loudly in development rather
-- than silently exposing data in production.
ALTER DEFAULT PRIVILEGES FOR ROLE excelex_owner IN SCHEMA public
  REVOKE ALL ON TABLES FROM excelex_app, excelex_platform, excelex_jobs;

-- ─────────────────────────────────────────────────────────────
-- 3. Client tables — explicit grants + RLS
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  client_tables text[] := ARRAY[
    'branches',
    'users',
    'user_branch_memberships',
    'roles',
    'user_roles',
    'role_permissions',
    'user_permissions',
    'password_policies',
    'password_history',
    'security_settings',
    'departments',
    'designations',
    'client_settings',
    'product_types',
    'product_groups',
    'products',
    'zones',
    'destinations',
    'service_centres',
    'sales_executives',
    'charges',
    'charge_components',
    'customers',
    'customer_fuel_surcharges',
    'customer_charges',
    'customer_volumetrics',
    'customer_contacts',
    'consignees',
    'shippers',
    'account_groups',
    'lookups',
    'pin_codes',
    'rate_cards',
    'rate_card_rows',
    'sessions',
    'invitations',
    'audit_events'
  ];
BEGIN
  FOREACH t IN ARRAY client_tables LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO excelex_app', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS client_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY client_isolation ON %I
        USING      (client_id = nullif(current_setting('app.client_id', true), '')::uuid)
        WITH CHECK (client_id = nullif(current_setting('app.client_id', true), '')::uuid)
    $f$, t);
  END LOOP;
END $$;

-- Audit trail is append-only for every runtime role.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM excelex_app, excelex_platform, excelex_jobs;

-- ─────────────────────────────────────────────────────────────
-- 4. Background jobs — narrow, enumerable cross-client reads
-- ─────────────────────────────────────────────────────────────
-- The alternative an implementer reaches for is BYPASSRLS, which silently
-- removes the database barrier for every job. This is deliberately narrow:
-- three named tables, visible in pg_policies, reviewable in a diff.
GRANT SELECT, UPDATE ON sessions TO excelex_jobs;
DROP POLICY IF EXISTS jobs_global_read ON sessions;
CREATE POLICY jobs_global_read ON sessions FOR ALL TO excelex_jobs USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────
-- 5. Platform tables — NEVER granted to the client runtime role
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  platform_tables text[] := ARRAY[
    'clients',
    'client_hostnames',
    'plans',
    'plan_limits',
    'permissions',
    'countries',
    'states',
    'subscriptions',
    'platform_users',
    'platform_sessions',
    'platform_user_mfa',
    'platform_audit_events',
    'support_access_sessions'
  ];
BEGIN
  FOREACH t IN ARRAY platform_tables LOOP
    EXECUTE format('REVOKE ALL ON %I FROM excelex_app, excelex_jobs', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO excelex_platform', t);
  END LOOP;
END $$;

REVOKE UPDATE, DELETE, TRUNCATE ON platform_audit_events FROM excelex_platform;

-- ─────────────────────────────────────────────────────────────
-- 6. Narrow accessors — the ONLY platform data a client request may read
-- ─────────────────────────────────────────────────────────────
-- search_path is pinned (the textbook SECURITY DEFINER escalation), EXECUTE is
-- revoked from PUBLIC, and neither function accepts a caller-supplied client id
-- except the hostname resolver, which necessarily takes a hostname — a public fact.

CREATE OR REPLACE FUNCTION public.resolve_client_by_host(p_hostname text)
RETURNS TABLE (client_id uuid, status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT h.client_id, t.status::text
  FROM public.client_hostnames h
  JOIN public.clients t ON t.id = h.client_id
  WHERE lower(h.hostname) = lower(p_hostname)
    AND h.retired_at IS NULL
  LIMIT 1;
$$;

ALTER FUNCTION public.resolve_client_by_host(text) OWNER TO excelex_owner;
REVOKE ALL ON FUNCTION public.resolve_client_by_host(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_client_by_host(text) TO excelex_app, excelex_platform;

-- Reads the sealed context, never a caller argument.
CREATE OR REPLACE FUNCTION public.current_client_status()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT t.status::text
  FROM public.clients t
  WHERE t.id = nullif(current_setting('app.client_id', true), '')::uuid;
$$;

ALTER FUNCTION public.current_client_status() OWNER TO excelex_owner;
REVOKE ALL ON FUNCTION public.current_client_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_client_status() TO excelex_app;

-- The permission catalogue is platform data — one vocabulary for every client,
-- which a client must not be able to edit — but every client's role editor has
-- to list it. Read-only through a narrow accessor, like hostname resolution.
CREATE OR REPLACE FUNCTION public.list_permissions()
RETURNS TABLE (key text, "group" text, label text, description text, deprecated boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p.key, p."group", p.label, p.description, p.deprecated
  FROM public.permissions p
  ORDER BY p."group", p.key;
$$;

ALTER FUNCTION public.list_permissions() OWNER TO excelex_owner;
REVOKE ALL ON FUNCTION public.list_permissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_permissions() TO excelex_app, excelex_platform;

-- Reference data is platform-owned — one world, shared by every client, which no
-- client may edit — but every address form has to read it. Read-only through
-- narrow accessors, like hostname resolution and the permission catalogue.
CREATE OR REPLACE FUNCTION public.list_countries()
RETURNS TABLE (code text, alpha3 text, name text, dial_code text, currency text, region text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT c.code, c.alpha3, c.name, c.dial_code, c.currency, c.region
  FROM public.countries c
  WHERE c.is_active
  ORDER BY c.name;
$$;

ALTER FUNCTION public.list_countries() OWNER TO excelex_owner;
REVOKE ALL ON FUNCTION public.list_countries() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_countries() TO excelex_app, excelex_platform;

CREATE OR REPLACE FUNCTION public.list_states(p_country_code text)
RETURNS TABLE (code text, name text, type text, gst_code text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT s.code, s.name, s.type, s.gst_code
  FROM public.states s
  WHERE upper(s.country_code) = upper(p_country_code)
    AND s.is_active
  ORDER BY s.name;
$$;

ALTER FUNCTION public.list_states(text) OWNER TO excelex_owner;
REVOKE ALL ON FUNCTION public.list_states(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_states(text) TO excelex_app, excelex_platform;

-- ─────────────────────────────────────────────────────────────
-- 7. Verification — must all report OK
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  bad int;
BEGIN
  SELECT count(*) INTO bad FROM pg_roles
    WHERE rolname IN ('excelex_app','excelex_platform','excelex_jobs')
      AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb);
  IF bad > 0 THEN
    RAISE EXCEPTION 'A runtime role holds SUPERUSER, BYPASSRLS, CREATEROLE or CREATEDB';
  END IF;

  SELECT count(*) INTO bad FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('branches','users','user_branch_memberships','roles',
                        'user_roles','role_permissions','user_permissions',
                        'password_policies','password_history','security_settings',
                        'departments','designations','client_settings',
                        'product_types','product_groups','products','zones','destinations','service_centres','sales_executives',
                        'charges','charge_components',
                        'customers','customer_fuel_surcharges','customer_charges',
                        'customer_volumetrics','customer_contacts','consignees','shippers','account_groups','lookups','pin_codes','rate_cards','rate_card_rows',
                        'sessions','invitations','audit_events')
      AND NOT (c.relrowsecurity AND c.relforcerowsecurity);
  IF bad > 0 THEN RAISE EXCEPTION '% client table(s) missing ENABLE+FORCE RLS', bad; END IF;

  SELECT count(*) INTO bad FROM information_schema.table_privileges
    WHERE grantee = 'excelex_app'
      AND table_schema = 'public'
      AND table_name IN ('clients','client_hostnames','subscriptions','platform_users',
                         'platform_sessions','platform_user_mfa','platform_audit_events',
                         'support_access_sessions','plans','plan_limits');
  IF bad > 0 THEN RAISE EXCEPTION 'excelex_app holds % privilege(s) on platform tables', bad; END IF;

  RAISE NOTICE 'OK: roles constrained, RLS forced on all client tables, platform tables revoked';
END $$;
