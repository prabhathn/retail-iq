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
		RETAILIQ_ANALYTICS.PUBLIC.PRODUCTS primary key (UPC) with synonyms=('articles','catalog','commodities','goods','inventory','items','merchandise','offerings','stock','wares') comment='The table contains records of retail products available for sale. Each record represents a single product and includes details about the product identification, branding, categorization, and pricing information.',
		RETAILIQ_ANALYTICS.PUBLIC.SHOPPERS primary key (SHOPPER_ID) comment='The table contains records of retail customers and their demographic characteristics. Each record represents an individual shopper with details about their age category, household composition, income level, and loyalty program participation status.',
		RETAILIQ_ANALYTICS.PUBLIC.STORES primary key (STORE_ID) comment='The table contains records of retail store locations. Each record represents a single store and includes details about the store''s geographic region and operational category.',
		RETAILIQ_ANALYTICS.PUBLIC.TRANSACTIONS primary key (TRANSACTION_ID) comment='The table contains records of retail transactions. Each record represents a single transaction and includes details about the shopper, store location, timing, and payment method used.',
		RETAILIQ_ANALYTICS.PUBLIC.TRANSACTION_ITEMS primary key (TRANSACTION_ID) comment='The table contains records of individual items purchased within retail transactions. Each record represents a single product within a transaction and includes product identification, pricing, and quantity details.'
	)
	relationships (
		T_TO_SHOPPER as TRANSACTIONS(SHOPPER_ID) references SHOPPERS(SHOPPER_ID),
		T_TO_STORE as TRANSACTIONS(STORE_ID) references STORES(STORE_ID),
		T_TO_TI as TRANSACTIONS(TRANSACTION_ID) references TRANSACTION_ITEMS(TRANSACTION_ID),
		TI_TO_PRD as TRANSACTION_ITEMS(UPC) references PRODUCTS(UPC)
	)
	facts (
		PRODUCTS.PRICE as PRICE with synonyms=('cost per unit','unit price') comment='Unit price of this item',
		TRANSACTION_ITEMS.DISCOUNT as DISCOUNT,
		TRANSACTION_ITEMS.UNIT_PRICE as UNIT_PRICE
	)
	dimensions (
		PRODUCTS.BRAND as BRAND,
		PRODUCTS.CATEGORY as CATEGORY,
		PRODUCTS.PRODUCT_NAME as PRODUCT_NAME,
		PRODUCTS.SUBCATEGORY as SUBCATEGORY,
		PRODUCTS.UPC as UPC,
		SHOPPERS.AGE_GROUP as AGE_GROUP comment='Age ranges or brackets used to categorize shoppers by their age demographics.',
		SHOPPERS.HOUSEHOLD_SIZE as HOUSEHOLD_SIZE comment='The number of people living in a shopper''s household.',
		SHOPPERS.INCOME_BRACKET as INCOME_BRACKET comment='Income ranges or brackets used to categorize shoppers by their annual household income levels.',
		SHOPPERS.LOYALTY_MEMBER as LOYALTY_MEMBER comment='Indicates whether the shopper is enrolled in the loyalty program.',
		SHOPPERS.SHOPPER_ID as SHOPPER_ID comment='Unique identifier for individual shoppers in the retail analytics system.',
		STORES.REGION as REGION comment='Geographic regions where stores are located.',
		STORES.STORE_ID as STORE_ID comment='Unique identifier for each store location.',
		STORES.STORE_NAME as STORE_NAME comment='The name of the retail store location.',
		STORES.STORE_TYPE as STORE_TYPE comment='The classification of store locations based on their geographic setting or market area.',
		TRANSACTIONS.PAYMENT_METHOD as PAYMENT_METHOD,
		TRANSACTIONS.SHOPPER_ID as SHOPPER_ID,
		TRANSACTIONS.STORE_ID as STORE_ID,
		TRANSACTIONS.TRANSACTION_DATE as TRANSACTION_DATE,
		TRANSACTIONS.TRANSACTION_ID as TRANSACTION_ID,
		TRANSACTION_ITEMS.ITEM_ID as ITEM_ID,
		TRANSACTION_ITEMS.QUANTITY as QUANTITY,
		TRANSACTION_ITEMS.TRANSACTION_ID as TRANSACTION_ID,
		TRANSACTION_ITEMS.UPC as UPC
	)
	comment='View for RetailIQ an analytics and operations platform for retailers and their vendor partners'
	with extension (CA='{"tables":[{"name":"PRODUCTS","dimensions":[{"name":"BRAND"},{"name":"CATEGORY"},{"name":"PRODUCT_NAME"},{"name":"SUBCATEGORY"},{"name":"UPC"}],"facts":[{"name":"PRICE"}]},{"name":"SHOPPERS","dimensions":[{"name":"AGE_GROUP","sample_values":["35-44","18-24","45-54"]},{"name":"HOUSEHOLD_SIZE","sample_values":["4","1","5"]},{"name":"INCOME_BRACKET","sample_values":["$75K-$100K","Over $150K","$30K-$50K"]},{"name":"LOYALTY_MEMBER","sample_values":["FALSE","TRUE"]},{"name":"SHOPPER_ID","sample_values":["SHP000001","SHP000201","SHP000019"]}]},{"name":"STORES","dimensions":[{"name":"REGION","sample_values":["Southeast","Midwest","Northeast"]},{"name":"STORE_ID","sample_values":["STR001","STR002","STR003"]},{"name":"STORE_NAME","sample_values":["Harbor View","Riverside Plaza","Downtown Market"]},{"name":"STORE_TYPE","sample_values":["Urban","Rural","Suburban"]}]},{"name":"TRANSACTIONS","dimensions":[{"name":"PAYMENT_METHOD"},{"name":"SHOPPER_ID"},{"name":"STORE_ID"},{"name":"TRANSACTION_DATE"},{"name":"TRANSACTION_ID"}]},{"name":"TRANSACTION_ITEMS","dimensions":[{"name":"ITEM_ID"},{"name":"QUANTITY"},{"name":"TRANSACTION_ID"},{"name":"UPC"}],"facts":[{"name":"DISCOUNT"},{"name":"UNIT_PRICE"}]}],"relationships":[{"name":"t_to_ti"},{"name":"ti_to_prd"},{"name":"t_to_shopper"},{"name":"t_to_store"}]}');

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
