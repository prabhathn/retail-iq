-- ============================================================================
-- RetailIQ - Extended data model (DDL and governance)
-- ============================================================================
-- Adds the calendar, vendor, promotion, inventory, supply-chain and retail-media
-- structures on top of the sales star schema, plus the governance for them.
--
-- This file only creates structure and reference data. The rows themselves are
-- derived from the existing sales history by scripts/extend_data_model.py, which
-- also runs this file first, so normally you run that script instead:
--
--     python -m scripts.extend_data_model
--
-- Everything here is idempotent (IF NOT EXISTS / CREATE OR REPLACE / MERGE), so
-- it is safe to re-run after a data top-up.
--
-- Governance model
-- ----------------
-- * Row access keeps using CURRENT_ROLE(), not IS_ROLE_IN_SESSION(). The app's
--   service user holds every RETAILIQ_ROLE_* and runs with secondary roles, so
--   IS_ROLE_IN_SESSION('RETAILIQ_ROLE_ADMIN') is TRUE inside a Dairy-manager
--   session and would silently widen every restricted role to full access.
-- * A new 'vendor' entitlement type lets one supplier own several brands
--   (VENDOR_BRANDS). Existing 'brand' entitlements keep working unchanged.
-- * Cost is retailer-confidential. COST_MASK returns cost only to roles whose
--   entitlements are all 'all' or 'category'; any brand or vendor entitlement
--   gets NULL, so margin metrics come back empty for suppliers everywhere -
--   dashboards, Cortex Analyst, the agent and raw SQL alike.
--
-- Prerequisites: ACCOUNTADMIN; snowflake_setup.sql, generate_synthetic_data.py
-- and retailiq_mirror.sql already run.
-- ============================================================================

USE ROLE ACCOUNTADMIN;
USE DATABASE RETAILIQ_ANALYTICS;
USE SCHEMA PUBLIC;

-- ============================================================================
-- Reference data: vendors and brand ownership
-- ============================================================================
-- Brand-to-parent mapping is illustrative, not an authoritative ownership record.

CREATE TABLE IF NOT EXISTS vendors (
    vendor_id VARCHAR(20) PRIMARY KEY,
    vendor_name VARCHAR(255) NOT NULL,
    vendor_type VARCHAR(30) NOT NULL,      -- manufacturer | grower
    lead_time_days INT NOT NULL,            -- promised order-to-delivery days
    payment_terms VARCHAR(20) NOT NULL
);

CREATE TABLE IF NOT EXISTS vendor_brands (
    brand VARCHAR(100) PRIMARY KEY,
    vendor_id VARCHAR(20) NOT NULL
);

MERGE INTO vendors t USING (
    SELECT column1 vendor_id, column2 vendor_name, column3 vendor_type, column4 lead_time_days, column5 payment_terms
    FROM VALUES
        ('V001', 'Kraft Heinz', 'manufacturer', 4, 'Net 45'),
        ('V002', 'PepsiCo', 'manufacturer', 3, 'Net 30'),
        ('V003', 'The Coca-Cola Company', 'manufacturer', 3, 'Net 30'),
        ('V004', 'Procter & Gamble', 'manufacturer', 5, 'Net 60'),
        ('V005', 'Mondelez International', 'manufacturer', 4, 'Net 45'),
        ('V006', 'Nestle USA', 'manufacturer', 4, 'Net 45'),
        ('V007', 'Hormel Foods', 'manufacturer', 4, 'Net 30'),
        ('V008', 'Campbell''s Company', 'manufacturer', 4, 'Net 45'),
        ('V009', 'Conagra Brands', 'manufacturer', 4, 'Net 45'),
        ('V010', 'Clorox Company', 'manufacturer', 5, 'Net 60'),
        ('V011', 'Grupo Bimbo', 'manufacturer', 2, 'Net 30'),
        ('V012', 'Flowers Foods', 'manufacturer', 2, 'Net 30'),
        ('V013', 'Unilever', 'manufacturer', 5, 'Net 60'),
        ('V014', 'Kenvue', 'manufacturer', 5, 'Net 60'),
        ('V015', 'Haleon', 'manufacturer', 5, 'Net 60'),
        ('V016', 'Colgate-Palmolive', 'manufacturer', 5, 'Net 60'),
        ('V017', 'The Hershey Company', 'manufacturer', 4, 'Net 45'),
        ('V018', 'Mars Inc.', 'manufacturer', 4, 'Net 45'),
        ('V019', 'Tyson Foods', 'manufacturer', 3, 'Net 30'),
        ('V020', 'Perdue Farms', 'manufacturer', 3, 'Net 30'),
        ('V021', 'Smithfield Foods', 'manufacturer', 3, 'Net 30'),
        ('V022', 'Boar''s Head Provisions', 'manufacturer', 3, 'Net 30'),
        ('V023', 'Chobani', 'manufacturer', 3, 'Net 30'),
        ('V024', 'Sodiaal (Yoplait)', 'manufacturer', 3, 'Net 30'),
        ('V025', 'Organic Valley', 'manufacturer', 3, 'Net 30'),
        ('V026', 'Horizon Organic', 'manufacturer', 3, 'Net 30'),
        ('V027', 'Tillamook County Creamery', 'manufacturer', 4, 'Net 30'),
        ('V028', 'Land O''Lakes', 'manufacturer', 3, 'Net 30'),
        ('V029', 'Barilla', 'manufacturer', 5, 'Net 45'),
        ('V030', 'McCormick & Company', 'manufacturer', 5, 'Net 45'),
        ('V031', 'B&G Foods', 'manufacturer', 4, 'Net 45'),
        ('V032', 'The Magnum Ice Cream Company', 'manufacturer', 4, 'Net 45'),
        ('V033', 'Froneri', 'manufacturer', 4, 'Net 45'),
        ('V034', 'Tropicana Brands Group', 'manufacturer', 3, 'Net 30'),
        ('V035', 'Primo Brands', 'manufacturer', 3, 'Net 30'),
        ('V036', 'Dole', 'grower', 2, 'Net 15'),
        ('V037', 'Chiquita', 'grower', 2, 'Net 15'),
        ('V038', 'Fresh Del Monte', 'grower', 2, 'Net 15'),
        ('V039', 'Driscoll''s', 'grower', 2, 'Net 15'),
        ('V040', 'Taylor Farms (Earthbound Farm)', 'grower', 2, 'Net 15')
) s ON t.vendor_id = s.vendor_id
WHEN MATCHED THEN UPDATE SET vendor_name = s.vendor_name, vendor_type = s.vendor_type,
    lead_time_days = s.lead_time_days, payment_terms = s.payment_terms
WHEN NOT MATCHED THEN INSERT VALUES (s.vendor_id, s.vendor_name, s.vendor_type, s.lead_time_days, s.payment_terms);

MERGE INTO vendor_brands t USING (
    SELECT column1 brand, column2 vendor_id FROM VALUES
        ('Kraft', 'V001'), ('Heinz', 'V001'), ('Oscar Mayer', 'V001'),
        ('Pepsi', 'V002'), ('Lay''s', 'V002'), ('Doritos', 'V002'), ('Gatorade', 'V002'),
        ('Coca-Cola', 'V003'), ('Minute Maid', 'V003'),
        ('Bounty', 'V004'), ('Charmin', 'V004'), ('Crest', 'V004'), ('Pantene', 'V004'),
        ('Head & Shoulders', 'V004'), ('Swiffer', 'V004'), ('Dawn', 'V004'),
        ('Oreo', 'V005'), ('Nabisco', 'V005'), ('Ritz', 'V005'),
        ('Stouffer''s', 'V006'), ('Lean Cuisine', 'V006'), ('DiGiorno', 'V006'), ('Starbucks', 'V006'),
        ('Hormel', 'V007'), ('Planters', 'V007'),
        ('Campbell''s', 'V008'), ('Pepperidge Farm', 'V008'),
        ('Hunt''s', 'V009'), ('Birds Eye', 'V009'),
        ('Clorox', 'V010'), ('Glad', 'V010'), ('Hidden Valley', 'V010'),
        ('Sara Lee', 'V011'), ('Arnold', 'V011'), ('Thomas''', 'V011'),
        ('Nature''s Own', 'V012'), ('Dave''s Killer Bread', 'V012'),
        ('Dove', 'V013'),
        ('Tylenol', 'V014'),
        ('Advil', 'V015'),
        ('Colgate', 'V016'),
        ('Hershey''s', 'V017'),
        ('M&M''s', 'V018'),
        ('Tyson', 'V019'),
        ('Perdue', 'V020'),
        ('Smithfield', 'V021'),
        ('Boar''s Head', 'V022'),
        ('Chobani', 'V023'),
        ('Yoplait', 'V024'),
        ('Organic Valley', 'V025'),
        ('Horizon', 'V026'),
        ('Tillamook', 'V027'),
        ('Land O''Lakes', 'V028'),
        ('Barilla', 'V029'),
        ('McCormick', 'V030'),
        ('Green Giant', 'V031'),
        ('Ben & Jerry''s', 'V032'),
        ('Häagen-Dazs', 'V033'),
        ('Tropicana', 'V034'),
        ('Poland Spring', 'V035'),
        ('Dole', 'V036'),
        ('Chiquita', 'V037'),
        ('Del Monte', 'V038'),
        ('Driscoll''s', 'V039'),
        ('Earthbound Farm', 'V040')
) s ON t.brand = s.brand
WHEN MATCHED THEN UPDATE SET vendor_id = s.vendor_id
WHEN NOT MATCHED THEN INSERT VALUES (s.brand, s.vendor_id);

-- ============================================================================
-- Calendar
-- ============================================================================
-- 4-5-4 retail calendar (NRF convention): the fiscal year starts on the Sunday
-- nearest February 1 and is labelled by the calendar year it starts in. Rows are
-- (re)built by extend_data_model.py to cover the data range with a year of
-- padding on each side.

CREATE TABLE IF NOT EXISTS dim_date (
    calendar_date DATE PRIMARY KEY,
    day_name VARCHAR(10),
    day_of_week INT,                 -- 0 = Sunday
    is_weekend BOOLEAN,
    calendar_month INT,
    calendar_year INT,
    fiscal_year INT,
    fiscal_quarter INT,
    fiscal_period INT,               -- 1-12, 4-5-4 weeks per quarter
    fiscal_week INT,                 -- 1-52 (53 in long years)
    fiscal_week_start DATE,
    is_holiday BOOLEAN,
    holiday_name VARCHAR(50),
    same_day_last_year DATE          -- 364 days back: same weekday, comparable week
);

-- ============================================================================
-- Dimension enrichment
-- ============================================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS vendor_id VARCHAR(20);
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(10, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_size VARCHAR(20);
ALTER TABLE products ADD COLUMN IF NOT EXISTS launch_date DATE;

ALTER TABLE stores ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS state VARCHAR(2);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS latitude FLOAT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS longitude FLOAT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS square_feet INT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS store_format VARCHAR(30);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS open_date DATE;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS comp_start_date DATE;   -- open_date + 13 months

ALTER TABLE shoppers ADD COLUMN IF NOT EXISTS home_store_id VARCHAR(20);
ALTER TABLE shoppers ADD COLUMN IF NOT EXISTS loyalty_enroll_date DATE;
ALTER TABLE shoppers ADD COLUMN IF NOT EXISTS zip3 VARCHAR(3);

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transaction_ts TIMESTAMP_NTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS channel VARCHAR(20);   -- in_store | pickup | delivery

-- Cost is snapshotted onto the sale line (standard COGS practice), which keeps
-- margin a single-table calculation and survives later cost changes.
ALTER TABLE transaction_items ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(10, 2);
ALTER TABLE transaction_items ADD COLUMN IF NOT EXISTS promotion_id VARCHAR(40);

-- ============================================================================
-- Facts
-- ============================================================================

CREATE TABLE IF NOT EXISTS promotions (
    promotion_id VARCHAR(40) PRIMARY KEY,
    promotion_name VARCHAR(255),
    promotion_type VARCHAR(30),       -- TPR | BOGO | DIGITAL_COUPON | LOYALTY_PRICE
    upc VARCHAR(20) NOT NULL,
    brand VARCHAR(100),
    category VARCHAR(100),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    discount_pct FLOAT NOT NULL,
    funded_by VARCHAR(20)             -- retailer | vendor
);

CREATE TABLE IF NOT EXISTS inventory_daily (
    snapshot_date DATE NOT NULL,
    store_id VARCHAR(20) NOT NULL,
    upc VARCHAR(20) NOT NULL,
    units_sold INT,
    units_received INT,
    on_hand_units INT,                -- end-of-day
    on_order_units INT,               -- end-of-day, open purchase orders
    is_out_of_stock BOOLEAN,          -- end-of-day on hand is zero
    days_of_supply FLOAT,             -- on hand / trailing 28-day average daily sales
    PRIMARY KEY (snapshot_date, store_id, upc)
);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
    po_id VARCHAR(20) NOT NULL,
    po_line INT NOT NULL,
    vendor_id VARCHAR(20) NOT NULL,
    store_id VARCHAR(20) NOT NULL,
    upc VARCHAR(20) NOT NULL,
    order_date DATE NOT NULL,
    promised_date DATE NOT NULL,
    received_date DATE,               -- NULL while still open
    ordered_units INT NOT NULL,
    received_units INT,
    unit_cost DECIMAL(10, 2),
    PRIMARY KEY (po_id, po_line)
);

CREATE TABLE IF NOT EXISTS ad_delivery_daily (
    campaign_id INT NOT NULL,
    delivery_date DATE NOT NULL,
    placement VARCHAR(30) NOT NULL,   -- onsite_search | onsite_display | offsite_social | offsite_programmatic | price_promotion
    target_brand VARCHAR(100),
    target_category VARCHAR(100),
    impressions INT,
    clicks INT,
    conversions INT,
    spend DECIMAL(12, 2),
    attributed_sales DECIMAL(14, 2),  -- same-day sales of the targeted products (not incremental)
    PRIMARY KEY (campaign_id, delivery_date, placement)
);

-- Header view: row access on the lines flows through, so each role only sees
-- purchase orders (and totals) for products it is entitled to.
CREATE OR REPLACE VIEW purchase_orders AS
SELECT po_id, vendor_id, store_id, order_date, promised_date,
       MAX(received_date) AS received_date,
       IFF(COUNT(received_date) = COUNT(*), 'received', 'open') AS status,
       COUNT(*) AS line_count,
       SUM(ordered_units) AS ordered_units,
       SUM(received_units) AS received_units
FROM purchase_order_lines
GROUP BY po_id, vendor_id, store_id, order_date, promised_date;

-- ============================================================================
-- Row access policies
-- ============================================================================
-- Bodies are replaced in place (ALTER ... SET BODY) so existing attachments stay
-- intact. Signatures are unchanged from snowflake_setup.sql; the only change is
-- the added 'vendor' branch resolved through VENDOR_BRANDS.

ALTER ROW ACCESS POLICY products_policy SET BODY ->
  COALESCE(
    EXISTS (
      SELECT 1 FROM role_entitlements re
      WHERE re.role_name = CURRENT_ROLE()
      AND (
        re.tenant_type = 'all'
        OR (re.tenant_type = 'category' AND re.tenant_id = category_val)
        OR (re.tenant_type = 'brand' AND re.tenant_id = brand_val)
        OR (re.tenant_type = 'vendor' AND EXISTS (
              SELECT 1 FROM vendor_brands vb
              WHERE vb.brand = brand_val AND vb.vendor_id = re.tenant_id))
      )
    ),
    FALSE
  );

ALTER ROW ACCESS POLICY transaction_items_policy SET BODY ->
  COALESCE(
    EXISTS (
      SELECT 1 FROM role_entitlements
      WHERE role_name = CURRENT_ROLE() AND tenant_type = 'all'
    )
    OR
    EXISTS (
      SELECT 1
      FROM products p
      JOIN role_entitlements re ON re.role_name = CURRENT_ROLE()
      LEFT JOIN vendor_brands vb ON vb.brand = p.brand
      WHERE p.upc = upc_val
      AND (
        (re.tenant_type = 'category' AND re.tenant_id = p.category)
        OR (re.tenant_type = 'brand' AND re.tenant_id = p.brand)
        OR (re.tenant_type = 'vendor' AND re.tenant_id = vb.vendor_id)
      )
    ),
    FALSE
  );

ALTER ROW ACCESS POLICY transactions_policy SET BODY ->
  COALESCE(
    EXISTS (
      SELECT 1 FROM role_entitlements
      WHERE role_name = CURRENT_ROLE() AND tenant_type = 'all'
    )
    OR
    EXISTS (
      SELECT 1
      FROM transaction_items ti
      JOIN products p ON ti.upc = p.upc
      JOIN role_entitlements re ON re.role_name = CURRENT_ROLE()
      LEFT JOIN vendor_brands vb ON vb.brand = p.brand
      WHERE ti.transaction_id = txn_id
      AND (
        (re.tenant_type = 'category' AND re.tenant_id = p.category)
        OR (re.tenant_type = 'brand' AND re.tenant_id = p.brand)
        OR (re.tenant_type = 'vendor' AND re.tenant_id = vb.vendor_id)
      )
    ),
    FALSE
  );

-- Product-keyed facts reuse the per-UPC policy.
ALTER TABLE inventory_daily ADD ROW ACCESS POLICY transaction_items_policy ON (upc);
ALTER TABLE purchase_order_lines ADD ROW ACCESS POLICY transaction_items_policy ON (upc);
ALTER TABLE promotions ADD ROW ACCESS POLICY transaction_items_policy ON (upc);
-- Ad delivery is keyed on what the campaign targets, which is exactly the
-- (category, brand) signature of products_policy.
ALTER TABLE ad_delivery_daily ADD ROW ACCESS POLICY products_policy ON (target_category, target_brand);

-- ============================================================================
-- Cost masking
-- ============================================================================
-- Retailer roles (every entitlement is 'all' or 'category') see cost. Anything
-- with a brand or vendor entitlement - or no entitlement at all - gets NULL.

CREATE MASKING POLICY IF NOT EXISTS cost_mask AS (val NUMBER(10, 2)) RETURNS NUMBER(10, 2) ->
  CASE
    WHEN EXISTS (
           SELECT 1 FROM role_entitlements
           WHERE role_name = CURRENT_ROLE() AND tenant_type IN ('all', 'category'))
     AND NOT EXISTS (
           SELECT 1 FROM role_entitlements
           WHERE role_name = CURRENT_ROLE() AND tenant_type IN ('brand', 'vendor'))
    THEN val
    ELSE NULL
  END;

ALTER TABLE products MODIFY COLUMN unit_cost SET MASKING POLICY cost_mask FORCE;
ALTER TABLE transaction_items MODIFY COLUMN unit_cost SET MASKING POLICY cost_mask FORCE;
ALTER TABLE purchase_order_lines MODIFY COLUMN unit_cost SET MASKING POLICY cost_mask FORCE;

-- ============================================================================
-- Governed views over the Postgres mirror (see retailiq_mirror.sql)
-- ============================================================================
-- Secure views keep the mirror's application-owned tables out of reach and
-- expose only analytical columns (no configuration JSON, automation settings or
-- owning app user).

CREATE OR REPLACE SECURE VIEW cohorts AS
SELECT id AS cohort_id, name AS cohort_name, description, cohort_type,
       shopper_count, is_active, created_at
FROM RETAILIQ_PG_MIRROR.PUBLIC.SHOPPER_COHORTS;

-- Row filtering is a join to the caller's entitlements (views cannot evaluate a
-- correlated EXISTS with an outer join). DISTINCT collapses roles that hold more
-- than one matching entitlement.
CREATE OR REPLACE SECURE VIEW campaigns AS
SELECT DISTINCT c.id AS campaign_id, c.name AS campaign_name, c.description, c.campaign_type,
       c.status, c.start_date::DATE AS start_date, c.end_date::DATE AS end_date,
       c.target_type, c.target_upc, c.target_brand, c.target_category, c.cohort_id,
       c.impressions, c.clicks, c.conversions, c.spend
FROM RETAILIQ_PG_MIRROR.PUBLIC.CAMPAIGNS c
JOIN role_entitlements re ON re.role_name = CURRENT_ROLE()
LEFT JOIN vendor_brands vb ON vb.brand = c.target_brand
WHERE re.tenant_type = 'all'
   OR (re.tenant_type = 'category' AND re.tenant_id = c.target_category)
   OR (re.tenant_type = 'brand' AND re.tenant_id = c.target_brand)
   OR (re.tenant_type = 'vendor' AND re.tenant_id = vb.vendor_id);

-- ============================================================================
-- Grants
-- ============================================================================
-- Reads for every application role; RETAILIQ_ROLE_ADMIN also writes, because
-- extend_data_model.py populates facts under an 'all'-entitled role (row access
-- policies filter even the table owner).

GRANT SELECT ON TABLE vendors TO ROLE RETAILIQ_ROLE_ADMIN;
GRANT SELECT ON TABLE vendor_brands TO ROLE RETAILIQ_ROLE_ADMIN;
GRANT SELECT ON TABLE dim_date TO ROLE RETAILIQ_ROLE_ADMIN;
GRANT SELECT ON TABLE promotions TO ROLE RETAILIQ_ROLE_ADMIN;
GRANT SELECT ON TABLE inventory_daily TO ROLE RETAILIQ_ROLE_ADMIN;
GRANT SELECT ON TABLE purchase_order_lines TO ROLE RETAILIQ_ROLE_ADMIN;
GRANT SELECT ON TABLE ad_delivery_daily TO ROLE RETAILIQ_ROLE_ADMIN;
GRANT INSERT, UPDATE, DELETE, TRUNCATE ON TABLE vendors TO ROLE RETAILIQ_ROLE_ADMIN;
GRANT INSERT, UPDATE, DELETE, TRUNCATE ON TABLE vendor_brands TO ROLE RETAILIQ_ROLE_ADMIN;
GRANT INSERT, UPDATE, DELETE, TRUNCATE ON TABLE dim_date TO ROLE RETAILIQ_ROLE_ADMIN;
GRANT INSERT, UPDATE, DELETE, TRUNCATE ON TABLE promotions TO ROLE RETAILIQ_ROLE_ADMIN;
GRANT INSERT, UPDATE, DELETE, TRUNCATE ON TABLE inventory_daily TO ROLE RETAILIQ_ROLE_ADMIN;
GRANT INSERT, UPDATE, DELETE, TRUNCATE ON TABLE purchase_order_lines TO ROLE RETAILIQ_ROLE_ADMIN;
GRANT INSERT, UPDATE, DELETE, TRUNCATE ON TABLE ad_delivery_daily TO ROLE RETAILIQ_ROLE_ADMIN;
GRANT SELECT ON VIEW purchase_orders TO ROLE RETAILIQ_ROLE_ADMIN;
GRANT SELECT ON VIEW cohorts TO ROLE RETAILIQ_ROLE_ADMIN;
GRANT SELECT ON VIEW campaigns TO ROLE RETAILIQ_ROLE_ADMIN;

GRANT SELECT ON TABLE vendors TO ROLE RETAILIQ_ROLE_DAIRY_MANAGER;
GRANT SELECT ON TABLE vendor_brands TO ROLE RETAILIQ_ROLE_DAIRY_MANAGER;
GRANT SELECT ON TABLE dim_date TO ROLE RETAILIQ_ROLE_DAIRY_MANAGER;
GRANT SELECT ON TABLE promotions TO ROLE RETAILIQ_ROLE_DAIRY_MANAGER;
GRANT SELECT ON TABLE inventory_daily TO ROLE RETAILIQ_ROLE_DAIRY_MANAGER;
GRANT SELECT ON TABLE purchase_order_lines TO ROLE RETAILIQ_ROLE_DAIRY_MANAGER;
GRANT SELECT ON TABLE ad_delivery_daily TO ROLE RETAILIQ_ROLE_DAIRY_MANAGER;
GRANT SELECT ON VIEW purchase_orders TO ROLE RETAILIQ_ROLE_DAIRY_MANAGER;
GRANT SELECT ON VIEW cohorts TO ROLE RETAILIQ_ROLE_DAIRY_MANAGER;
GRANT SELECT ON VIEW campaigns TO ROLE RETAILIQ_ROLE_DAIRY_MANAGER;

GRANT SELECT ON TABLE vendors TO ROLE RETAILIQ_ROLE_KRAFT_VENDOR;
GRANT SELECT ON TABLE vendor_brands TO ROLE RETAILIQ_ROLE_KRAFT_VENDOR;
GRANT SELECT ON TABLE dim_date TO ROLE RETAILIQ_ROLE_KRAFT_VENDOR;
GRANT SELECT ON TABLE promotions TO ROLE RETAILIQ_ROLE_KRAFT_VENDOR;
GRANT SELECT ON TABLE inventory_daily TO ROLE RETAILIQ_ROLE_KRAFT_VENDOR;
GRANT SELECT ON TABLE purchase_order_lines TO ROLE RETAILIQ_ROLE_KRAFT_VENDOR;
GRANT SELECT ON TABLE ad_delivery_daily TO ROLE RETAILIQ_ROLE_KRAFT_VENDOR;
GRANT SELECT ON VIEW purchase_orders TO ROLE RETAILIQ_ROLE_KRAFT_VENDOR;
GRANT SELECT ON VIEW cohorts TO ROLE RETAILIQ_ROLE_KRAFT_VENDOR;
GRANT SELECT ON VIEW campaigns TO ROLE RETAILIQ_ROLE_KRAFT_VENDOR;

GRANT SELECT ON TABLE vendors TO ROLE RETAILIQ_ROLE_BEV_SNACKS;
GRANT SELECT ON TABLE vendor_brands TO ROLE RETAILIQ_ROLE_BEV_SNACKS;
GRANT SELECT ON TABLE dim_date TO ROLE RETAILIQ_ROLE_BEV_SNACKS;
GRANT SELECT ON TABLE promotions TO ROLE RETAILIQ_ROLE_BEV_SNACKS;
GRANT SELECT ON TABLE inventory_daily TO ROLE RETAILIQ_ROLE_BEV_SNACKS;
GRANT SELECT ON TABLE purchase_order_lines TO ROLE RETAILIQ_ROLE_BEV_SNACKS;
GRANT SELECT ON TABLE ad_delivery_daily TO ROLE RETAILIQ_ROLE_BEV_SNACKS;
GRANT SELECT ON VIEW purchase_orders TO ROLE RETAILIQ_ROLE_BEV_SNACKS;
GRANT SELECT ON VIEW cohorts TO ROLE RETAILIQ_ROLE_BEV_SNACKS;
GRANT SELECT ON VIEW campaigns TO ROLE RETAILIQ_ROLE_BEV_SNACKS;

GRANT SELECT ON TABLE vendors TO ROLE RETAILIQ_ROLE_PRODUCE_MANAGER;
GRANT SELECT ON TABLE vendor_brands TO ROLE RETAILIQ_ROLE_PRODUCE_MANAGER;
GRANT SELECT ON TABLE dim_date TO ROLE RETAILIQ_ROLE_PRODUCE_MANAGER;
GRANT SELECT ON TABLE promotions TO ROLE RETAILIQ_ROLE_PRODUCE_MANAGER;
GRANT SELECT ON TABLE inventory_daily TO ROLE RETAILIQ_ROLE_PRODUCE_MANAGER;
GRANT SELECT ON TABLE purchase_order_lines TO ROLE RETAILIQ_ROLE_PRODUCE_MANAGER;
GRANT SELECT ON TABLE ad_delivery_daily TO ROLE RETAILIQ_ROLE_PRODUCE_MANAGER;
GRANT SELECT ON VIEW purchase_orders TO ROLE RETAILIQ_ROLE_PRODUCE_MANAGER;
GRANT SELECT ON VIEW cohorts TO ROLE RETAILIQ_ROLE_PRODUCE_MANAGER;
GRANT SELECT ON VIEW campaigns TO ROLE RETAILIQ_ROLE_PRODUCE_MANAGER;

GRANT SELECT ON TABLE vendors TO ROLE RETAILIQ_ROLE_COCACOLA_VENDOR;
GRANT SELECT ON TABLE vendor_brands TO ROLE RETAILIQ_ROLE_COCACOLA_VENDOR;
GRANT SELECT ON TABLE dim_date TO ROLE RETAILIQ_ROLE_COCACOLA_VENDOR;
GRANT SELECT ON TABLE promotions TO ROLE RETAILIQ_ROLE_COCACOLA_VENDOR;
GRANT SELECT ON TABLE inventory_daily TO ROLE RETAILIQ_ROLE_COCACOLA_VENDOR;
GRANT SELECT ON TABLE purchase_order_lines TO ROLE RETAILIQ_ROLE_COCACOLA_VENDOR;
GRANT SELECT ON TABLE ad_delivery_daily TO ROLE RETAILIQ_ROLE_COCACOLA_VENDOR;
GRANT SELECT ON VIEW purchase_orders TO ROLE RETAILIQ_ROLE_COCACOLA_VENDOR;
GRANT SELECT ON VIEW cohorts TO ROLE RETAILIQ_ROLE_COCACOLA_VENDOR;
GRANT SELECT ON VIEW campaigns TO ROLE RETAILIQ_ROLE_COCACOLA_VENDOR;
