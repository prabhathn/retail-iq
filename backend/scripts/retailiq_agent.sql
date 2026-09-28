-- ============================================================================
-- RetailIQ - Cortex Agent
-- ============================================================================
-- Creates the Cortex Agent that backs the RetailIQ AI Assistant. The agent is
-- grounded on RETAILIQ_SV via a cortex_analyst_text_to_sql tool, so every answer
-- is generated against the governed semantic model rather than raw tables.
--
-- The backend calls this agent over REST:
--   POST /api/v2/databases/RETAILIQ_ANALYTICS/schemas/PUBLIC/agents/RETAILIQ_AGENT:run
-- authenticating with a Programmatic Access Token and passing X-Snowflake-Role
-- so row access policies apply per persona.
--
-- Run AFTER retailiq_semantic_view.sql.
--
-- Prerequisites:
--   - ACCOUNTADMIN (or a role with CREATE AGENT on the schema)
-- ============================================================================

USE ROLE ACCOUNTADMIN;
USE DATABASE RETAILIQ_ANALYTICS;
USE SCHEMA PUBLIC;

CREATE OR REPLACE AGENT RETAILIQ_ANALYTICS.PUBLIC.RETAILIQ_AGENT
WITH PROFILE = '{"display_name": "RetailIQ Agent"}'
    COMMENT = 'Answers questions about sales, margin, promotions, inventory, supply chain, retail media and shoppers for retail merchants and their brand partners.'
FROM SPECIFICATION $$
{
  "models": {
    "orchestration": "auto"
  },
  "orchestration": {},
  "instructions": {
    "sample_questions": [
      {
        "question": "What were my top performing items in the most recent week?"
      },
      {
        "question": "What was gross margin by category last fiscal quarter?"
      },
      {
        "question": "Which stores had the worst in-stock rate last month?"
      },
      {
        "question": "What is the fill rate and on-time delivery by vendor?"
      },
      {
        "question": "How much of my revenue was sold on promotion?"
      },
      {
        "question": "What was the ROAS of my retail media campaigns?"
      }
    ],
    "response": "Cost, COGS, gross profit and margin are retailer-confidential. If those values come back empty, tell the user their role is not entitled to cost or margin data - never estimate, infer or back into them from other numbers. Describe retail media ROAS as attributed, not incremental."
  },
  "tools": [
    {
      "tool_spec": {
        "type": "cortex_analyst_text_to_sql",
        "name": "RetailIQ_Analyst",
        "description": "PRODUCTS:\n- Database: RETAILIQ_ANALYTICS, Schema: PUBLIC\n- Contains comprehensive product catalog information for retail items available for sale. Each record represents a unique product with identification, branding, categorization, and pricing details.\n- This table serves as the master product reference, enabling product-based analytics across the retail chain (no inventory or stock data is available).\n- LIST OF COLUMNS: UPC (universal product code - primary identifier), BRAND (product brand name), CATEGORY (main product category), PRODUCT_NAME (full product name), SUBCATEGORY (detailed product classification), PRICE (unit price of item)\n\nSHOPPERS:\n- Database: RETAILIQ_ANALYTICS, Schema: PUBLIC\n- Stores customer demographic and profile information for retail store shoppers. Each record represents an individual customer with their personal characteristics and loyalty program status.\n- This table enables customer segmentation analysis and personalized marketing strategies based on demographic patterns and shopping behaviors.\n- LIST OF COLUMNS: SHOPPER_ID (unique customer identifier), AGE_GROUP (age demographic brackets), HOUSEHOLD_SIZE (number of people in household), INCOME_BRACKET (annual household income ranges), LOYALTY_MEMBER (loyalty program enrollment status)\n\nSTORES:\n- Database: RETAILIQ_ANALYTICS, Schema: PUBLIC\n- Contains information about retail store locations and their operational characteristics. Each record represents a physical store location with geographic and operational details.\n- This table supports location-based analysis and regional performance comparisons across different store types and markets.\n- LIST OF COLUMNS: STORE_ID (unique store identifier), REGION (geographic location), STORE_NAME (store location name), STORE_TYPE (urban/suburban/rural classification)\n\nTRANSACTIONS:\n- Database: RETAILIQ_ANALYTICS, Schema: PUBLIC\n- Records all retail transactions with customer, location, and payment information. Each record represents a complete shopping transaction linking customers to stores.\n- This table serves as the central transaction hub connecting shoppers, stores, and individual purchase items for comprehensive sales analysis.\n- LIST OF COLUMNS: TRANSACTION_ID (unique transaction identifier), SHOPPER_ID (customer identifier - links to SHOPPERS table), STORE_ID (store location identifier - links to STORES table), TRANSACTION_DATE (transaction timestamp), PAYMENT_METHOD (payment type used)\n\nTRANSACTION_ITEMS:\n- Database: RETAILIQ_ANALYTICS, Schema: PUBLIC\n- Contains detailed line-item information for each product purchased within transactions. Each record represents a single product purchase with quantity, pricing, and discount details.\n- This table provides granular purchase data enabling product-level sales analysis and pricing optimization strategies.\n- LIST OF COLUMNS: TRANSACTION_ID (transaction identifier - links to TRANSACTIONS table), ITEM_ID (individual item identifier), UPC (product code - links to PRODUCTS table), QUANTITY (number of items purchased), UNIT_PRICE (price per unit), DISCOUNT (discount amount applied)\n\nREASONING:\nThis semantic view represents a comprehensive retail analytics platform that connects customer demographics, store locations, product catalogs, and detailed transaction data. The relationships form a complete retail ecosystem where transactions link shoppers to stores, transaction items connect purchases to specific products, and all components work together to enable comprehensive retail analytics and business intelligence.\n\nDESCRIPTION:\nThe RETAILIQ_SV semantic view provides a complete retail analytics platform within the RETAILIQ_ANALYTICS database, connecting customer demographics, store operations, product catalogs, and detailed transaction data. The view enables comprehensive analysis of shopping patterns by linking shoppers' demographic profiles to their purchases across different store locations and product categories. Transaction data serves as the central hub, connecting customers to stores through the TRANSACTIONS table, while TRANSACTION_ITEMS provides granular purchase details linked to the product catalog. This integrated structure supports advanced retail analytics including customer segmentation, regional performance analysis, product sales optimization, and loyalty program effectiveness measurement across the entire retail ecosystem."
      }
    }
  ],
  "tool_resources": {
    "RetailIQ_Analyst": {
      "execution_environment": {
        "query_timeout": 60,
        "type": "warehouse",
        "warehouse": ""
      },
      "semantic_view": "RETAILIQ_ANALYTICS.PUBLIC.RETAILIQ_SV",
      "description": "RETAILIQ_SV covers the whole retail model in RETAILIQ_ANALYTICS.PUBLIC.\n- Sales: TRANSACTIONS (basket, store, shopper, date, time, channel) and TRANSACTION_ITEMS (units, price, discount, cost, promotion). Metrics: revenue (gross), net revenue, units, baskets, basket value, discount rate, promo share, COGS, gross profit and margin %.\n- Products and VENDORS (brand owners, lead times); STORES (region, city, format, square feet, open and comp dates); SHOPPERS (demographics, loyalty, home store); COHORTS and COHORT_MEMBERS.\n- DIM_DATE: 4-5-4 fiscal calendar, holidays, same day last year.\n- PROMOTIONS: price cuts, coupons, loyalty prices, BOGO, and who funds them.\n- INVENTORY_DAILY: end-of-day on hand, out of stock, days of supply (a snapshot - never summed across days).\n- PURCHASE_ORDER_LINES: vendor replenishment orders; fill rate, on-time delivery, lead time.\n- CAMPAIGNS and AD_DELIVERY_DAILY: retail media impressions, clicks, spend, CTR and ROAS.\nRow access policies restrict every table to the caller's categories, brands or vendor. Cost and margin are masked (NULL) for supplier roles."
    }
  }
}
$$;

-- ============================================================================
-- Grants
-- ============================================================================
GRANT USAGE ON AGENT RETAILIQ_ANALYTICS.PUBLIC.RETAILIQ_AGENT TO ROLE RETAILIQ_ROLE_ADMIN;
GRANT USAGE ON AGENT RETAILIQ_ANALYTICS.PUBLIC.RETAILIQ_AGENT TO ROLE RETAILIQ_ROLE_DAIRY_MANAGER;
GRANT USAGE ON AGENT RETAILIQ_ANALYTICS.PUBLIC.RETAILIQ_AGENT TO ROLE RETAILIQ_ROLE_KRAFT_VENDOR;
GRANT USAGE ON AGENT RETAILIQ_ANALYTICS.PUBLIC.RETAILIQ_AGENT TO ROLE RETAILIQ_ROLE_BEV_SNACKS;
GRANT USAGE ON AGENT RETAILIQ_ANALYTICS.PUBLIC.RETAILIQ_AGENT TO ROLE RETAILIQ_ROLE_PRODUCE_MANAGER;
GRANT USAGE ON AGENT RETAILIQ_ANALYTICS.PUBLIC.RETAILIQ_AGENT TO ROLE RETAILIQ_ROLE_COCACOLA_VENDOR;

-- ============================================================================
-- Verification
-- ============================================================================
SHOW AGENTS LIKE 'RETAILIQ_AGENT' IN SCHEMA RETAILIQ_ANALYTICS.PUBLIC;
