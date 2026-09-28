-- ============================================================================
-- RetailIQ - Postgres to Snowflake mirror
-- ============================================================================
-- Continuously replicates the two application tables that analytics needs
-- (cohort definitions and campaigns) from the RETAILIQ_PG Snowflake Postgres
-- instance into RETAILIQ_PG_MIRROR, using Snowflake Postgres managed mirroring.
--
-- Only named tables are mirrored, never the whole public schema: that schema
-- also holds users (password hashes), activity logs and other app internals
-- that have no business in the analytics account.
--
-- RETAILIQ_PG_MIRROR is created and owned by the SNOWFLAKE application. Nothing
-- reads it directly - retailiq_data_model.sql exposes governed secure views
-- (COHORTS, CAMPAIGNS) in RETAILIQ_ANALYTICS.PUBLIC on top of it.
--
-- Prerequisites:
--   - ACCOUNTADMIN (must own the Postgres instance)
--   - RETAILIQ_PG on a STANDARD or HIGH MEMORY tier (BURSTABLE is unsupported)
--   - The target database must not already exist
-- ============================================================================

USE ROLE ACCOUNTADMIN;

GRANT APPLICATION ROLE snowflake.postgres_mirror_admin TO ROLE ACCOUNTADMIN;

-- Must be granted before CREATE_MIRROR, and never revoked while the mirror runs.
GRANT USAGE ON POSTGRES INSTANCE RETAILIQ_PG TO APPLICATION snowflake;

CALL SNOWFLAKE.POSTGRES.CREATE_MIRROR(
    mirror_name       => 'retailiq_app',
    postgres_instance => 'RETAILIQ_PG',
    postgres_database => 'retailiq',
    target_database   => 'RETAILIQ_PG_MIRROR',
    postgres_tables   => ['public.shopper_cohorts', 'public.campaigns'],
    postgres_schemas  => NULL,
    refresh_interval  => '5 minutes',
    warehouse         => NULL
);

-- ============================================================================
-- Verification
-- ============================================================================
-- Both tables should move from SNAPSHOTTING to REPLICATING within a minute.
CALL SNOWFLAKE.POSTGRES.LIST_MIRRORED_TABLES('retailiq_app');
CALL SNOWFLAKE.POSTGRES.DESCRIBE_MIRROR('retailiq_app');
