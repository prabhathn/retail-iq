-- ============================================================================
-- RetailIQ - Semantic View
-- ============================================================================
-- Defines the governed semantic model that Cortex Analyst (and therefore the
-- RetailIQ AI Assistant) uses to translate natural language into SQL.
--
-- Run AFTER snowflake_setup.sql and AFTER generate_synthetic_data.py, because
-- the view references the tables and expects them to exist.
--
-- Prerequisites:
--   - ACCOUNTADMIN (or a role with CREATE SEMANTIC VIEW on the schema)
-- ============================================================================

USE ROLE ACCOUNTADMIN;
USE DATABASE RETAILIQ_ANALYTICS;
USE SCHEMA PUBLIC;

create or replace semantic view RETAILIQ_ANALYTICS.PUBLIC.RETAILIQ_SV
	tables (
		RETAILIQ_ANALYTICS.PUBLIC.PRODUCTS primary key (UPC) with synonyms=('articles','catalog','commodities','goods','items','merchandise','offerings','wares') comment='The table contains records of retail products available for sale. Each record represents a single product and includes details about the product identification, branding, categorization, and pricing information.',
		RETAILIQ_ANALYTICS.PUBLIC.SHOPPERS primary key (SHOPPER_ID) comment='The table contains records of retail customers and their demographic characteristics. Each record represents an individual shopper with details about their age category, household composition, income level, and loyalty program participation status.',
		RETAILIQ_ANALYTICS.PUBLIC.STORES primary key (STORE_ID) comment='The table contains records of retail store locations. Each record represents a single store and includes details about the store''s geographic region and operational category.',
		RETAILIQ_ANALYTICS.PUBLIC.TRANSACTIONS primary key (TRANSACTION_ID) comment='The table contains records of retail transactions. Each record represents a single transaction and includes details about the shopper, store location, timing, and payment method used.',
		RETAILIQ_ANALYTICS.PUBLIC.TRANSACTION_ITEMS primary key (ITEM_ID) comment='The table contains records of individual items purchased within retail transactions. Each record represents a single product within a transaction and includes product identification, pricing, and quantity details.'
	)
	relationships (
		TXN_TO_SHOPPER as TRANSACTIONS(TXN_SHOPPER_ID) references SHOPPERS(SHOPPER_ID),
		TXN_TO_STORE as TRANSACTIONS(TXN_STORE_ID) references STORES(STORE_ID),
		TI_TO_PRODUCT as TRANSACTION_ITEMS(TI_UPC) references PRODUCTS(UPC),
		TI_TO_TXN as TRANSACTION_ITEMS(TI_TRANSACTION_ID) references TRANSACTIONS(TRANSACTION_ID)
	)
	facts (
		PRODUCTS.PRICE as PRICE with synonyms=('cost per unit','unit price') comment='Unit price of this item',
		TRANSACTION_ITEMS.QUANTITY as QUANTITY comment='Units of the product purchased on this line.',
		TRANSACTION_ITEMS.DISCOUNT as DISCOUNT comment='Markdown per unit in dollars. Line discount = QUANTITY * DISCOUNT.',
		TRANSACTION_ITEMS.UNIT_PRICE as UNIT_PRICE comment='Shelf price per unit at time of sale, before discount.'
	)
	dimensions (
		PRODUCTS.BRAND as BRAND,
		PRODUCTS.CATEGORY as CATEGORY,
		PRODUCTS.PRODUCT_NAME as PRODUCT_NAME,
		PRODUCTS.SUBCATEGORY as SUBCATEGORY,
		PRODUCTS.UPC as UPC,
		SHOPPERS.AGE_GROUP as AGE_GROUP comment='Age ranges or brackets used to categorize shoppers by their age demographics.' sample_values ('35-44', '18-24', '45-54'),
		SHOPPERS.HOUSEHOLD_SIZE as HOUSEHOLD_SIZE comment='The number of people living in a shopper''s household.' sample_values ('4', '1', '5'),
		SHOPPERS.INCOME_BRACKET as INCOME_BRACKET comment='Income ranges or brackets used to categorize shoppers by their annual household income levels.' sample_values ('$75K-$100K', 'Over $150K', '$30K-$50K'),
		SHOPPERS.LOYALTY_MEMBER as LOYALTY_MEMBER comment='Indicates whether the shopper is enrolled in the loyalty program.' sample_values ('FALSE', 'TRUE'),
		SHOPPERS.SHOPPER_ID as SHOPPER_ID comment='Unique identifier for individual shoppers in the retail analytics system.' sample_values ('SHP000001', 'SHP000201', 'SHP000019'),
		STORES.REGION as REGION comment='Geographic regions where stores are located.' sample_values ('Southeast', 'Midwest', 'Northeast'),
		STORES.STORE_ID as STORE_ID comment='Unique identifier for each store location.' sample_values ('STR001', 'STR002', 'STR003'),
		STORES.STORE_NAME as STORE_NAME comment='The name of the retail store location.' sample_values ('Harbor View', 'Riverside Plaza', 'Downtown Market'),
		STORES.STORE_TYPE as STORE_TYPE comment='The classification of store locations based on their geographic setting or market area.' sample_values ('Urban', 'Rural', 'Suburban'),
		TRANSACTIONS.PAYMENT_METHOD as PAYMENT_METHOD,
		TRANSACTIONS.TXN_SHOPPER_ID as SHOPPER_ID comment='Foreign key to SHOPPERS. Group by SHOPPERS.SHOPPER_ID instead.',
		TRANSACTIONS.TXN_STORE_ID as STORE_ID comment='Foreign key to STORES. Group by STORES.STORE_ID instead.',
		TRANSACTIONS.TRANSACTION_ID as TRANSACTION_ID,
		TRANSACTIONS.TRANSACTION_DATE as TRANSACTION_DATE with synonyms=('date','sale date','purchase date') comment='Calendar date of the transaction. Use for all time-based filtering and trending.',
		TRANSACTION_ITEMS.ITEM_ID as ITEM_ID,
		TRANSACTION_ITEMS.TI_TRANSACTION_ID as TRANSACTION_ID comment='Foreign key on the line item.',
		TRANSACTION_ITEMS.TI_UPC as UPC comment='Foreign key on the line item.'
	)
	metrics (
		TRANSACTIONS.ACTIVE_SHOPPERS as COUNT(DISTINCT TRANSACTIONS.TXN_SHOPPER_ID) with synonyms=('unique shoppers','customer count') comment='Number of distinct shoppers who made a purchase.',
		TRANSACTION_ITEMS.REVENUE as SUM(TRANSACTION_ITEMS.QUANTITY * TRANSACTION_ITEMS.UNIT_PRICE) with synonyms=('sales','gross revenue','gross sales','dollar sales') comment='Gross sales dollars (quantity x unit price, before discounts). Default revenue definition; matches the RetailIQ dashboards.',
		TRANSACTION_ITEMS.NET_REVENUE as SUM(TRANSACTION_ITEMS.QUANTITY * (TRANSACTION_ITEMS.UNIT_PRICE - TRANSACTION_ITEMS.DISCOUNT)) with synonyms=('net sales') comment='Sales dollars after per-unit discounts. Use only when net figures are requested.',
		TRANSACTION_ITEMS.DISCOUNT_AMOUNT as SUM(TRANSACTION_ITEMS.QUANTITY * TRANSACTION_ITEMS.DISCOUNT) with synonyms=('markdowns','total discount') comment='Total discount dollars given (quantity x per-unit discount).',
		TRANSACTION_ITEMS.DISCOUNT_RATE as SUM(TRANSACTION_ITEMS.QUANTITY * TRANSACTION_ITEMS.DISCOUNT) / NULLIF(SUM(TRANSACTION_ITEMS.QUANTITY * TRANSACTION_ITEMS.UNIT_PRICE), 0) with synonyms=('markdown rate') comment='Discount dollars as a share of gross revenue (0 to 1).',
		TRANSACTION_ITEMS.UNITS_SOLD as SUM(TRANSACTION_ITEMS.QUANTITY) with synonyms=('units','unit sales','volume') comment='Total units sold.',
		TRANSACTION_ITEMS.TRANSACTION_COUNT as COUNT(DISTINCT TRANSACTION_ITEMS.TI_TRANSACTION_ID) with synonyms=('baskets','trips','number of transactions','orders') comment='Number of distinct shopping transactions (baskets).',
		TRANSACTION_ITEMS.AVG_BASKET_VALUE as SUM(TRANSACTION_ITEMS.QUANTITY * TRANSACTION_ITEMS.UNIT_PRICE) / NULLIF(COUNT(DISTINCT TRANSACTION_ITEMS.TI_TRANSACTION_ID), 0) with synonyms=('average ticket','average transaction value','ATV') comment='Average gross revenue per transaction.',
		TRANSACTION_ITEMS.UNITS_PER_BASKET as SUM(TRANSACTION_ITEMS.QUANTITY) / NULLIF(COUNT(DISTINCT TRANSACTION_ITEMS.TI_TRANSACTION_ID), 0) with synonyms=('basket size','UPT') comment='Average units per transaction.'
	)
	comment='View for RetailIQ an analytics and operations platform for retailers and their vendor partners'
	ai_sql_generation 'Revenue means gross revenue (REVENUE metric) unless the user explicitly asks for net. Always use the defined metrics instead of re-deriving formulas. This model has no inventory, stock-on-hand, cost, or margin data; say so rather than approximating.'
	with extension (CA='{"tables":[{"name":"PRODUCTS","dimensions":[{"name":"BRAND"},{"name":"CATEGORY"},{"name":"PRODUCT_NAME"},{"name":"SUBCATEGORY"},{"name":"UPC"}],"facts":[{"name":"PRICE"}]},{"name":"SHOPPERS","dimensions":[{"name":"AGE_GROUP"},{"name":"HOUSEHOLD_SIZE"},{"name":"INCOME_BRACKET"},{"name":"LOYALTY_MEMBER"},{"name":"SHOPPER_ID"}]},{"name":"STORES","dimensions":[{"name":"REGION"},{"name":"STORE_ID"},{"name":"STORE_NAME"},{"name":"STORE_TYPE"}]},{"name":"TRANSACTIONS","dimensions":[{"name":"PAYMENT_METHOD"},{"name":"TXN_SHOPPER_ID"},{"name":"TXN_STORE_ID"},{"name":"TRANSACTION_ID"}],"metrics":[{"name":"ACTIVE_SHOPPERS"}],"time_dimensions":[{"name":"TRANSACTION_DATE"}]},{"name":"TRANSACTION_ITEMS","dimensions":[{"name":"ITEM_ID"},{"name":"TI_TRANSACTION_ID"},{"name":"TI_UPC"}],"facts":[{"name":"QUANTITY"},{"name":"DISCOUNT"},{"name":"UNIT_PRICE"}],"metrics":[{"name":"REVENUE"},{"name":"NET_REVENUE"},{"name":"DISCOUNT_AMOUNT"},{"name":"DISCOUNT_RATE"},{"name":"UNITS_SOLD"},{"name":"TRANSACTION_COUNT"},{"name":"AVG_BASKET_VALUE"},{"name":"UNITS_PER_BASKET"}]}],"relationships":[{"name":"TI_TO_TXN"},{"name":"TI_TO_PRODUCT"},{"name":"TXN_TO_SHOPPER"},{"name":"TXN_TO_STORE"}]}');

-- ============================================================================
-- Grants
-- ============================================================================
-- Every application role needs SELECT on the semantic view. Row access policies
-- on the underlying tables still apply, so a vendor querying through the agent
-- sees only their own brand.

GRANT SELECT ON SEMANTIC VIEW RETAILIQ_ANALYTICS.PUBLIC.RETAILIQ_SV TO ROLE RETAILIQ_ROLE_ADMIN;
GRANT SELECT ON SEMANTIC VIEW RETAILIQ_ANALYTICS.PUBLIC.RETAILIQ_SV TO ROLE RETAILIQ_ROLE_DAIRY_MANAGER;
GRANT SELECT ON SEMANTIC VIEW RETAILIQ_ANALYTICS.PUBLIC.RETAILIQ_SV TO ROLE RETAILIQ_ROLE_KRAFT_VENDOR;
GRANT SELECT ON SEMANTIC VIEW RETAILIQ_ANALYTICS.PUBLIC.RETAILIQ_SV TO ROLE RETAILIQ_ROLE_BEV_SNACKS;
GRANT SELECT ON SEMANTIC VIEW RETAILIQ_ANALYTICS.PUBLIC.RETAILIQ_SV TO ROLE RETAILIQ_ROLE_PRODUCE_MANAGER;
GRANT SELECT ON SEMANTIC VIEW RETAILIQ_ANALYTICS.PUBLIC.RETAILIQ_SV TO ROLE RETAILIQ_ROLE_COCACOLA_VENDOR;

-- ============================================================================
-- Verification
-- ============================================================================
SHOW SEMANTIC VIEWS LIKE 'RETAILIQ_SV' IN SCHEMA RETAILIQ_ANALYTICS.PUBLIC;
