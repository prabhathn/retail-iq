-- ============================================================================
-- RetailIQ - Complete Snowflake Setup Script
-- ============================================================================
-- This script creates all Snowflake objects needed for the RetailIQ platform:
--   1. Warehouse
--   2. Database and Schema
--   3. Core Tables (products, stores, shoppers, transactions, etc.)
--   4. Document Management Stage and Table
--   5. Application Roles for RBAC
--   6. Role grants to the application user
--   7. Object permissions
--   8. Row Access Policies
--   9. Role Entitlements (demo data)
--
-- Prerequisites:
--   - Run with ACCOUNTADMIN privileges
--
-- AUTHENTICATION MODEL
--   This script does NOT create a service-account user and does NOT contain any
--   password. The application authenticates as an existing Snowflake user using
--   a Programmatic Access Token (PAT), which is required by the Cortex Agent
--   REST API and also works as the password for the Python connector.
--
--   Set $app_user below to the user the application will connect as, then
--   generate a PAT for that user and put it in .env as SNOWFLAKE_PASSWORD.
--
-- After running this script:
--   1. Generate a PAT for $app_user and set SNOWFLAKE_PASSWORD in .env
--   2. Run generate_synthetic_data.py to populate tables with sample data
--   3. Run init_postgres.py to set up application users and scopes
--   4. Run retailiq_semantic_view.sql then retailiq_agent.sql (these also
--      grant themselves to the roles created here)
-- ============================================================================

USE ROLE ACCOUNTADMIN;

-- ============================================================================
-- 0. CONFIGURATION
-- ============================================================================
-- Change these if you are deploying under different names.

SET app_user       = 'ADMIN';                 -- existing user the app connects as
SET warehouse_name = 'RETAILIQ_WH';
SET database_name  = 'RETAILIQ_ANALYTICS';
SET schema_name    = 'PUBLIC';
SET db_and_schema  = $database_name || '.' || $schema_name;

-- ============================================================================
-- 1. WAREHOUSE
-- ============================================================================

CREATE WAREHOUSE IF NOT EXISTS IDENTIFIER($warehouse_name)
    WAREHOUSE_SIZE = 'XSMALL'
    AUTO_SUSPEND = 300
    AUTO_RESUME = TRUE
    INITIALLY_SUSPENDED = TRUE
    COMMENT = 'Compute for the RetailIQ application';

-- ============================================================================
-- 2. DATABASE AND SCHEMA
-- ============================================================================

CREATE DATABASE IF NOT EXISTS IDENTIFIER($database_name)
    COMMENT = 'RetailIQ - unified retail analytics (customers, transactions, stores, assortment, documents)';
USE DATABASE IDENTIFIER($database_name);
CREATE SCHEMA IF NOT EXISTS IDENTIFIER($schema_name);
USE SCHEMA IDENTIFIER($schema_name);

-- ============================================================================
-- 3. CORE TABLES
-- ============================================================================

-- Products table
CREATE TABLE IF NOT EXISTS products (
    upc VARCHAR(20) PRIMARY KEY,
    product_name VARCHAR(255) NOT NULL,
    brand VARCHAR(100),
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    price DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- Stores table
CREATE TABLE IF NOT EXISTS stores (
    store_id VARCHAR(20) PRIMARY KEY,
    store_name VARCHAR(255) NOT NULL,
    region VARCHAR(50) NOT NULL,
    store_type VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- Shoppers table
CREATE TABLE IF NOT EXISTS shoppers (
    shopper_id VARCHAR(20) PRIMARY KEY,
    age_group VARCHAR(20),
    household_size INT,
    income_bracket VARCHAR(20),
    loyalty_member BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    transaction_id VARCHAR(30) PRIMARY KEY,
    shopper_id VARCHAR(20) NOT NULL,
    store_id VARCHAR(20) NOT NULL,
    transaction_date DATE NOT NULL,
    payment_method VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- Transaction items table
-- NOTE: store_id is intentionally NOT on this table. Store context is reached by
-- joining through transactions, which is what every query in the app does. An
-- earlier version of this script declared a store_id column here that the data
-- generator never created, so the two definitions disagreed.
CREATE TABLE IF NOT EXISTS transaction_items (
    item_id VARCHAR(40) PRIMARY KEY,
    transaction_id VARCHAR(30) NOT NULL,
    upc VARCHAR(20) NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    discount DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- Role entitlements table for RBAC (uses CURRENT_ROLE() for role-based access)
CREATE TABLE IF NOT EXISTS role_entitlements (
    role_name VARCHAR(100) NOT NULL,
    tenant_type VARCHAR(50) NOT NULL,
    tenant_id VARCHAR(255),
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Cohort members table (for shopper cohorts feature)
CREATE TABLE IF NOT EXISTS cohort_members (
    user_id INTEGER NOT NULL,
    cohort_id INTEGER NOT NULL,
    shopper_id VARCHAR(50) NOT NULL,
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    PRIMARY KEY (user_id, cohort_id, shopper_id)
);

-- ============================================================================
-- 4. DOCUMENT MANAGEMENT (Agreements Feature)
-- ============================================================================
-- These objects live inside RETAILIQ_ANALYTICS.PUBLIC, so their unqualified
-- names cannot collide with any other deployment's objects.

-- Internal stage with server-side encryption (required for AI_PARSE_DOCUMENT)
CREATE STAGE IF NOT EXISTS USER_DOCUMENTS_STAGE
    ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE')
    COMMENT = 'Internal stage for user document storage with server-side encryption for Cortex AI';

-- Documents metadata table
CREATE TABLE IF NOT EXISTS USER_DOCUMENTS (
    id VARCHAR(50) PRIMARY KEY,
    user_id INTEGER NOT NULL,
    file_name VARCHAR(500) NOT NULL,
    file_type VARCHAR(20),
    file_size_bytes INTEGER,
    stage_path VARCHAR(1000),
    document_type VARCHAR(100),
    description TEXT,
    parsed_content TEXT,
    parse_status VARCHAR(50) DEFAULT 'pending',
    parse_error TEXT,
    page_count INTEGER,
    created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    parsed_at TIMESTAMP_NTZ
);

-- ============================================================================
-- 5. APPLICATION ROLES
-- ============================================================================
-- These roles correspond to the application's permission scopes. The names must
-- match the role_name values seeded into the scopes table by init_postgres.py
-- and into role_entitlements in section 9 - the row access policies compare
-- role_entitlements.role_name against CURRENT_ROLE().

CREATE ROLE IF NOT EXISTS RETAILIQ_ROLE_ADMIN;
COMMENT ON ROLE RETAILIQ_ROLE_ADMIN IS 'Full access to all data - Administrator role';

CREATE ROLE IF NOT EXISTS RETAILIQ_ROLE_DAIRY_MANAGER;
COMMENT ON ROLE RETAILIQ_ROLE_DAIRY_MANAGER IS 'Access to Dairy category data';

CREATE ROLE IF NOT EXISTS RETAILIQ_ROLE_KRAFT_VENDOR;
COMMENT ON ROLE RETAILIQ_ROLE_KRAFT_VENDOR IS 'Access to Kraft brand data';

CREATE ROLE IF NOT EXISTS RETAILIQ_ROLE_BEV_SNACKS;
COMMENT ON ROLE RETAILIQ_ROLE_BEV_SNACKS IS 'Access to Beverages and Snacks categories';

CREATE ROLE IF NOT EXISTS RETAILIQ_ROLE_PRODUCE_MANAGER;
COMMENT ON ROLE RETAILIQ_ROLE_PRODUCE_MANAGER IS 'Access to Produce category data';

CREATE ROLE IF NOT EXISTS RETAILIQ_ROLE_COCACOLA_VENDOR;
COMMENT ON ROLE RETAILIQ_ROLE_COCACOLA_VENDOR IS 'Access to Coca-Cola brand data';

-- ============================================================================
-- 6. GRANT ROLES TO THE APPLICATION USER
-- ============================================================================
-- The application switches roles per request to enforce row-level access, so
-- the connecting user must be able to assume every application role.

GRANT ROLE RETAILIQ_ROLE_ADMIN            TO USER IDENTIFIER($app_user);
GRANT ROLE RETAILIQ_ROLE_DAIRY_MANAGER    TO USER IDENTIFIER($app_user);
GRANT ROLE RETAILIQ_ROLE_KRAFT_VENDOR     TO USER IDENTIFIER($app_user);
GRANT ROLE RETAILIQ_ROLE_BEV_SNACKS       TO USER IDENTIFIER($app_user);
GRANT ROLE RETAILIQ_ROLE_PRODUCE_MANAGER  TO USER IDENTIFIER($app_user);
GRANT ROLE RETAILIQ_ROLE_COCACOLA_VENDOR  TO USER IDENTIFIER($app_user);

-- ============================================================================
-- 7. GRANT OBJECT PERMISSIONS TO ROLES
-- ============================================================================

-- Admin role - full access
GRANT USAGE ON WAREHOUSE IDENTIFIER($warehouse_name) TO ROLE RETAILIQ_ROLE_ADMIN;
GRANT USAGE ON DATABASE IDENTIFIER($database_name) TO ROLE RETAILIQ_ROLE_ADMIN;
GRANT USAGE ON SCHEMA IDENTIFIER($db_and_schema) TO ROLE RETAILIQ_ROLE_ADMIN;
GRANT SELECT ON ALL TABLES IN SCHEMA IDENTIFIER($db_and_schema) TO ROLE RETAILIQ_ROLE_ADMIN;
GRANT SELECT ON FUTURE TABLES IN SCHEMA IDENTIFIER($db_and_schema) TO ROLE RETAILIQ_ROLE_ADMIN;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA IDENTIFIER($db_and_schema) TO ROLE RETAILIQ_ROLE_ADMIN;
GRANT INSERT, UPDATE, DELETE ON FUTURE TABLES IN SCHEMA IDENTIFIER($db_and_schema) TO ROLE RETAILIQ_ROLE_ADMIN;
GRANT READ, WRITE ON STAGE USER_DOCUMENTS_STAGE TO ROLE RETAILIQ_ROLE_ADMIN;
-- write_pandas (used by the data generator and the admin data top-up) stages rows
-- in a temporary internal stage before COPY, so the admin role needs CREATE STAGE.
-- Without this, the top-up fails with "Insufficient privileges to operate on schema".
GRANT CREATE STAGE ON SCHEMA IDENTIFIER($db_and_schema) TO ROLE RETAILIQ_ROLE_ADMIN;

-- Dairy Manager role
GRANT USAGE ON WAREHOUSE IDENTIFIER($warehouse_name) TO ROLE RETAILIQ_ROLE_DAIRY_MANAGER;
GRANT USAGE ON DATABASE IDENTIFIER($database_name) TO ROLE RETAILIQ_ROLE_DAIRY_MANAGER;
GRANT USAGE ON SCHEMA IDENTIFIER($db_and_schema) TO ROLE RETAILIQ_ROLE_DAIRY_MANAGER;
GRANT SELECT ON ALL TABLES IN SCHEMA IDENTIFIER($db_and_schema) TO ROLE RETAILIQ_ROLE_DAIRY_MANAGER;
GRANT SELECT ON FUTURE TABLES IN SCHEMA IDENTIFIER($db_and_schema) TO ROLE RETAILIQ_ROLE_DAIRY_MANAGER;

-- Kraft Vendor role
GRANT USAGE ON WAREHOUSE IDENTIFIER($warehouse_name) TO ROLE RETAILIQ_ROLE_KRAFT_VENDOR;
GRANT USAGE ON DATABASE IDENTIFIER($database_name) TO ROLE RETAILIQ_ROLE_KRAFT_VENDOR;
GRANT USAGE ON SCHEMA IDENTIFIER($db_and_schema) TO ROLE RETAILIQ_ROLE_KRAFT_VENDOR;
GRANT SELECT ON ALL TABLES IN SCHEMA IDENTIFIER($db_and_schema) TO ROLE RETAILIQ_ROLE_KRAFT_VENDOR;
GRANT SELECT ON FUTURE TABLES IN SCHEMA IDENTIFIER($db_and_schema) TO ROLE RETAILIQ_ROLE_KRAFT_VENDOR;

-- Beverages & Snacks role
GRANT USAGE ON WAREHOUSE IDENTIFIER($warehouse_name) TO ROLE RETAILIQ_ROLE_BEV_SNACKS;
GRANT USAGE ON DATABASE IDENTIFIER($database_name) TO ROLE RETAILIQ_ROLE_BEV_SNACKS;
GRANT USAGE ON SCHEMA IDENTIFIER($db_and_schema) TO ROLE RETAILIQ_ROLE_BEV_SNACKS;
GRANT SELECT ON ALL TABLES IN SCHEMA IDENTIFIER($db_and_schema) TO ROLE RETAILIQ_ROLE_BEV_SNACKS;
GRANT SELECT ON FUTURE TABLES IN SCHEMA IDENTIFIER($db_and_schema) TO ROLE RETAILIQ_ROLE_BEV_SNACKS;

-- Produce Manager role
GRANT USAGE ON WAREHOUSE IDENTIFIER($warehouse_name) TO ROLE RETAILIQ_ROLE_PRODUCE_MANAGER;
GRANT USAGE ON DATABASE IDENTIFIER($database_name) TO ROLE RETAILIQ_ROLE_PRODUCE_MANAGER;
GRANT USAGE ON SCHEMA IDENTIFIER($db_and_schema) TO ROLE RETAILIQ_ROLE_PRODUCE_MANAGER;
GRANT SELECT ON ALL TABLES IN SCHEMA IDENTIFIER($db_and_schema) TO ROLE RETAILIQ_ROLE_PRODUCE_MANAGER;
GRANT SELECT ON FUTURE TABLES IN SCHEMA IDENTIFIER($db_and_schema) TO ROLE RETAILIQ_ROLE_PRODUCE_MANAGER;

-- Coca-Cola Vendor role
GRANT USAGE ON WAREHOUSE IDENTIFIER($warehouse_name) TO ROLE RETAILIQ_ROLE_COCACOLA_VENDOR;
GRANT USAGE ON DATABASE IDENTIFIER($database_name) TO ROLE RETAILIQ_ROLE_COCACOLA_VENDOR;
GRANT USAGE ON SCHEMA IDENTIFIER($db_and_schema) TO ROLE RETAILIQ_ROLE_COCACOLA_VENDOR;
GRANT SELECT ON ALL TABLES IN SCHEMA IDENTIFIER($db_and_schema) TO ROLE RETAILIQ_ROLE_COCACOLA_VENDOR;
GRANT SELECT ON FUTURE TABLES IN SCHEMA IDENTIFIER($db_and_schema) TO ROLE RETAILIQ_ROLE_COCACOLA_VENDOR;

-- ============================================================================
-- 8. ROW ACCESS POLICIES
-- ============================================================================
-- These policies filter data based on CURRENT_ROLE() and role_entitlements.
-- They are what makes the vendor experience safe: a Kraft vendor is not merely
-- shown less in the UI, the database returns less.
--
-- Policy names are unqualified and therefore scoped to this database - they
-- cannot collide with another deployment's policies.

-- Detach before redefining. A row access policy cannot be replaced while it is
-- attached, but ALTER TABLE ... DROP ROW ACCESS POLICY errors when the policy is
-- not attached - and "DROP ROW ACCESS POLICY IF EXISTS" is NOT valid inside
-- ALTER TABLE. Each detach therefore runs in its own scripting block with an
-- exception handler, which makes re-running this script safe.

EXECUTE IMMEDIATE $$
DECLARE
  ignored INT;
BEGIN
  ALTER TABLE products DROP ROW ACCESS POLICY products_policy;
  RETURN 'products_policy detached';
EXCEPTION
  WHEN OTHER THEN
    ignored := 1;
    RETURN 'products_policy was not attached';
END;
$$;

EXECUTE IMMEDIATE $$
DECLARE
  ignored INT;
BEGIN
  ALTER TABLE transactions DROP ROW ACCESS POLICY transactions_policy;
  RETURN 'transactions_policy detached';
EXCEPTION
  WHEN OTHER THEN
    ignored := 1;
    RETURN 'transactions_policy was not attached';
END;
$$;

EXECUTE IMMEDIATE $$
DECLARE
  ignored INT;
BEGIN
  ALTER TABLE transaction_items DROP ROW ACCESS POLICY transaction_items_policy;
  RETURN 'transaction_items_policy detached';
EXCEPTION
  WHEN OTHER THEN
    ignored := 1;
    RETURN 'transaction_items_policy was not attached';
END;
$$;

DROP ROW ACCESS POLICY IF EXISTS products_policy;
DROP ROW ACCESS POLICY IF EXISTS transactions_policy;
DROP ROW ACCESS POLICY IF EXISTS transaction_items_policy;

-- Products policy - filters by category or brand based on role entitlements
CREATE OR REPLACE ROW ACCESS POLICY products_policy
AS (category_val VARCHAR, brand_val VARCHAR)
RETURNS BOOLEAN ->
  COALESCE(
    EXISTS (
      SELECT 1 FROM role_entitlements
      WHERE role_name = CURRENT_ROLE()
      AND (
        tenant_type = 'all'
        OR (tenant_type = 'category' AND tenant_id = category_val)
        OR (tenant_type = 'brand' AND tenant_id = brand_val)
      )
    ),
    FALSE
  );

ALTER TABLE products ADD ROW ACCESS POLICY products_policy ON (category, brand);

-- Transactions policy - full access, or access to at least one product in the basket
CREATE OR REPLACE ROW ACCESS POLICY transactions_policy
AS (txn_id VARCHAR)
RETURNS BOOLEAN ->
  COALESCE(
    EXISTS (
      SELECT 1 FROM role_entitlements
      WHERE role_name = CURRENT_ROLE()
      AND tenant_type = 'all'
    )
    OR
    EXISTS (
      SELECT 1
      FROM transaction_items ti
      JOIN products p ON ti.upc = p.upc
      JOIN role_entitlements re ON re.role_name = CURRENT_ROLE()
      WHERE ti.transaction_id = txn_id
      AND (
        (re.tenant_type = 'category' AND re.tenant_id = p.category)
        OR (re.tenant_type = 'brand' AND re.tenant_id = p.brand)
      )
    ),
    FALSE
  );

ALTER TABLE transactions ADD ROW ACCESS POLICY transactions_policy ON (transaction_id);

-- Transaction items policy - filters based on product access
CREATE OR REPLACE ROW ACCESS POLICY transaction_items_policy
AS (upc_val VARCHAR)
RETURNS BOOLEAN ->
  COALESCE(
    EXISTS (
      SELECT 1 FROM role_entitlements
      WHERE role_name = CURRENT_ROLE()
      AND tenant_type = 'all'
    )
    OR
    EXISTS (
      SELECT 1
      FROM products p
      JOIN role_entitlements re ON re.role_name = CURRENT_ROLE()
      WHERE p.upc = upc_val
      AND (
        (re.tenant_type = 'category' AND re.tenant_id = p.category)
        OR (re.tenant_type = 'brand' AND re.tenant_id = p.brand)
      )
    ),
    FALSE
  );

ALTER TABLE transaction_items ADD ROW ACCESS POLICY transaction_items_policy ON (upc);

-- ============================================================================
-- 9. SEED ROLE ENTITLEMENTS (Demo Data)
-- ============================================================================
-- generate_synthetic_data.py re-seeds these same rows, so the two must agree.

DELETE FROM role_entitlements;

-- RETAILIQ_ROLE_ADMIN: Administrator - full access
INSERT INTO role_entitlements (role_name, tenant_type, tenant_id) VALUES ('RETAILIQ_ROLE_ADMIN', 'all', NULL);

-- RETAILIQ_ROLE_DAIRY_MANAGER: Dairy Category Manager
INSERT INTO role_entitlements (role_name, tenant_type, tenant_id) VALUES ('RETAILIQ_ROLE_DAIRY_MANAGER', 'category', 'Dairy');

-- RETAILIQ_ROLE_KRAFT_VENDOR: Kraft Vendor
INSERT INTO role_entitlements (role_name, tenant_type, tenant_id) VALUES ('RETAILIQ_ROLE_KRAFT_VENDOR', 'brand', 'Kraft');

-- RETAILIQ_ROLE_BEV_SNACKS: Beverages & Snacks Team (multiple categories)
INSERT INTO role_entitlements (role_name, tenant_type, tenant_id) VALUES ('RETAILIQ_ROLE_BEV_SNACKS', 'category', 'Beverages');
INSERT INTO role_entitlements (role_name, tenant_type, tenant_id) VALUES ('RETAILIQ_ROLE_BEV_SNACKS', 'category', 'Snacks');

-- RETAILIQ_ROLE_PRODUCE_MANAGER: Produce Manager
INSERT INTO role_entitlements (role_name, tenant_type, tenant_id) VALUES ('RETAILIQ_ROLE_PRODUCE_MANAGER', 'category', 'Produce');

-- RETAILIQ_ROLE_COCACOLA_VENDOR: Coca-Cola Vendor
INSERT INTO role_entitlements (role_name, tenant_type, tenant_id) VALUES ('RETAILIQ_ROLE_COCACOLA_VENDOR', 'brand', 'Coca-Cola');

-- ============================================================================
-- 10. VERIFICATION
-- ============================================================================

SHOW ROLES LIKE 'RETAILIQ_ROLE_%';
SHOW TABLES IN SCHEMA IDENTIFIER($db_and_schema);
SELECT * FROM role_entitlements ORDER BY role_name, tenant_type, tenant_id;

-- ============================================================================
-- SETUP COMPLETE
-- ============================================================================
-- Next steps:
--   1. Generate a Programmatic Access Token for the user named in $app_user and
--      put it in .env as SNOWFLAKE_PASSWORD, with SNOWFLAKE_USER set to that
--      same user. A PAT is required for the Cortex Agent REST API and also
--      authenticates the Python connector.
--   2. Run: python -m scripts.generate_synthetic_data
--   3. Run: python -m scripts.init_postgres
--   4. Run: retailiq_semantic_view.sql, then retailiq_agent.sql
--      (each grants itself to the six roles created above)
-- ============================================================================
