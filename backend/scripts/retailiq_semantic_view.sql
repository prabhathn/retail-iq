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
		RETAILIQ_ANALYTICS.PUBLIC.TRANSACTION_ITEMS primary key (ITEM_ID) comment='The table contains records of individual items purchased within retail transactions. Each record represents a single product within a transaction and includes product identification, pricing, and quantity details.',
		RETAILIQ_ANALYTICS.PUBLIC.VENDORS primary key (VENDOR_ID) with synonyms=('suppliers','manufacturers','partners') comment='Suppliers (manufacturers and growers) that own the brands the retailer sells.',
		RETAILIQ_ANALYTICS.PUBLIC.DIM_DATE primary key (CALENDAR_DATE) with synonyms=('calendar','fiscal calendar') comment='Retail calendar. Fiscal periods follow the 4-5-4 NRF calendar; the fiscal year starts on the Sunday nearest February 1 and is named for the calendar year it starts in.',
		RETAILIQ_ANALYTICS.PUBLIC.PROMOTIONS primary key (PROMOTION_ID) with synonyms=('deals','promos','trade promotions') comment='Promotion windows per product: temporary price reductions, digital coupons, loyalty prices and BOGO. Each discounted sales line links to the promotion that priced it.',
		RETAILIQ_ANALYTICS.PUBLIC.INVENTORY_DAILY primary key (SNAPSHOT_DATE,INV_STORE_ID,INV_UPC) with synonyms=('inventory','stock','on hand','stock levels') comment='End-of-day stock position per store, product and day. This is a SNAPSHOT: on-hand units must never be summed across days - use the average or a single date.',
		RETAILIQ_ANALYTICS.PUBLIC.PURCHASE_ORDER_LINES primary key (PO_ID,PO_LINE) with synonyms=('purchase orders','POs','replenishment orders','supply chain') comment='Replenishment purchase orders from vendors to stores, one row per order line. Received date and units are NULL while the order is still open.',
		RETAILIQ_ANALYTICS.PUBLIC.CAMPAIGNS primary key (CAMPAIGN_ID) with synonyms=('ad campaigns','retail media campaigns') comment='Retail media and promotion campaigns created in RetailIQ (mirrored from the app database).',
		RETAILIQ_ANALYTICS.PUBLIC.AD_DELIVERY_DAILY primary key (AD_CAMPAIGN_ID,DELIVERY_DATE,PLACEMENT) with synonyms=('ad performance','media delivery','retail media') comment='Daily retail-media delivery per campaign and placement. Attributed sales are same-day sales of the targeted products credited to the campaign, not measured incrementality.',
		RETAILIQ_ANALYTICS.PUBLIC.COHORTS primary key (COHORT_ID) with synonyms=('segments','audiences') comment='Shopper cohorts defined in RetailIQ (mirrored from the app database).',
		RETAILIQ_ANALYTICS.PUBLIC.COHORT_MEMBERS primary key (CM_USER_ID,CM_COHORT_ID,CM_SHOPPER_ID) comment='Which shoppers belong to which cohort.'
	)
	relationships (
		PRODUCT_TO_VENDOR as PRODUCTS(PRODUCT_VENDOR_ID) references VENDORS(VENDOR_ID),
		TXN_TO_DATE as TRANSACTIONS(TXN_DATE_KEY) references DIM_DATE(CALENDAR_DATE),
		TXN_TO_SHOPPER as TRANSACTIONS(TXN_SHOPPER_ID) references SHOPPERS(SHOPPER_ID),
		TXN_TO_STORE as TRANSACTIONS(TXN_STORE_ID) references STORES(STORE_ID),
		TI_TO_PRODUCT as TRANSACTION_ITEMS(TI_UPC) references PRODUCTS(UPC),
		TI_TO_PROMOTION as TRANSACTION_ITEMS(TI_PROMOTION_ID) references PROMOTIONS(PROMOTION_ID),
		TI_TO_TXN as TRANSACTION_ITEMS(TI_TRANSACTION_ID) references TRANSACTIONS(TRANSACTION_ID),
		INV_TO_DATE as INVENTORY_DAILY(INV_DATE_KEY) references DIM_DATE(CALENDAR_DATE),
		INV_TO_PRODUCT as INVENTORY_DAILY(INV_UPC) references PRODUCTS(UPC),
		INV_TO_STORE as INVENTORY_DAILY(INV_STORE_ID) references STORES(STORE_ID),
		PO_TO_PRODUCT as PURCHASE_ORDER_LINES(PO_UPC) references PRODUCTS(UPC),
		PO_TO_STORE as PURCHASE_ORDER_LINES(PO_STORE_ID) references STORES(STORE_ID),
		AD_TO_CAMPAIGN as AD_DELIVERY_DAILY(AD_CAMPAIGN_ID) references CAMPAIGNS(CAMPAIGN_ID),
		AD_TO_DATE as AD_DELIVERY_DAILY(AD_DATE_KEY) references DIM_DATE(CALENDAR_DATE),
		CM_TO_COHORT as COHORT_MEMBERS(CM_COHORT_ID) references COHORTS(COHORT_ID),
		CM_TO_SHOPPER as COHORT_MEMBERS(CM_SHOPPER_ID) references SHOPPERS(SHOPPER_ID)
	)
	facts (
		PRODUCTS.PRICE as PRICE with synonyms=('cost per unit','unit price') comment='Unit price of this item',
		PRODUCTS.PRODUCT_UNIT_COST as UNIT_COST comment='Current unit cost. Retailer-confidential: NULL for supplier roles.',
		STORES.SQUARE_FEET as SQUARE_FEET comment='Selling area in square feet. Use for sales per square foot.',
		STORES.LATITUDE as LATITUDE,
		STORES.LONGITUDE as LONGITUDE,
		TRANSACTION_ITEMS.QUANTITY as QUANTITY comment='Units of the product purchased on this line.',
		TRANSACTION_ITEMS.DISCOUNT as DISCOUNT comment='Markdown per unit in dollars. Line discount = QUANTITY * DISCOUNT.',
		TRANSACTION_ITEMS.UNIT_PRICE as UNIT_PRICE comment='Shelf price per unit at time of sale, before discount.',
		TRANSACTION_ITEMS.UNIT_COST as UNIT_COST comment='Unit cost at time of sale. Retailer-confidential: NULL for supplier roles.',
		VENDORS.LEAD_TIME_DAYS as LEAD_TIME_DAYS comment='Promised order-to-delivery lead time in days.',
		PROMOTIONS.DISCOUNT_PCT as DISCOUNT_PCT comment='Discount off shelf price (0-1).',
		INVENTORY_DAILY.ON_HAND_UNITS as ON_HAND_UNITS comment='End-of-day units on hand. Snapshot: do not sum across days.',
		INVENTORY_DAILY.ON_ORDER_UNITS as ON_ORDER_UNITS comment='Units on open purchase orders. Snapshot.',
		INVENTORY_DAILY.INV_UNITS_SOLD as UNITS_SOLD comment='Units sold that day (flow; can be summed).',
		INVENTORY_DAILY.UNITS_RECEIVED as UNITS_RECEIVED comment='Units received that day (flow; can be summed).',
		INVENTORY_DAILY.DAYS_OF_SUPPLY as DAYS_OF_SUPPLY comment='On hand divided by trailing 28-day average daily sales.',
		PURCHASE_ORDER_LINES.ORDERED_UNITS as ORDERED_UNITS,
		PURCHASE_ORDER_LINES.RECEIVED_UNITS as RECEIVED_UNITS,
		PURCHASE_ORDER_LINES.PO_UNIT_COST as UNIT_COST comment='Unit cost on the order. NULL for supplier roles.',
		AD_DELIVERY_DAILY.AD_IMPRESSIONS as IMPRESSIONS,
		AD_DELIVERY_DAILY.AD_CLICKS as CLICKS,
		AD_DELIVERY_DAILY.AD_CONVERSIONS as CONVERSIONS,
		AD_DELIVERY_DAILY.AD_SPEND as SPEND,
		AD_DELIVERY_DAILY.ATTRIBUTED_SALES as ATTRIBUTED_SALES
	)
	dimensions (
		PRODUCTS.BRAND as BRAND,
		PRODUCTS.CATEGORY as CATEGORY,
		PRODUCTS.PRODUCT_NAME as PRODUCT_NAME,
		PRODUCTS.SUBCATEGORY as SUBCATEGORY,
		PRODUCTS.UPC as UPC,
		PRODUCTS.PRODUCT_VENDOR_ID as VENDOR_ID comment='Foreign key to VENDORS (the supplier that owns the brand).',
		PRODUCTS.PACK_SIZE as PACK_SIZE comment='Pack size parsed from the product name, e.g. 12pk, 16oz, each.',
		PRODUCTS.LAUNCH_DATE as LAUNCH_DATE comment='Date the product was first ranged.',
		SHOPPERS.AGE_GROUP as AGE_GROUP comment='Age ranges or brackets used to categorize shoppers by their age demographics.' sample_values ('35-44', '18-24', '45-54'),
		SHOPPERS.HOUSEHOLD_SIZE as HOUSEHOLD_SIZE comment='The number of people living in a shopper''s household.' sample_values ('4', '1', '5'),
		SHOPPERS.INCOME_BRACKET as INCOME_BRACKET comment='Income ranges or brackets used to categorize shoppers by their annual household income levels.' sample_values ('$75K-$100K', 'Over $150K', '$30K-$50K'),
		SHOPPERS.LOYALTY_MEMBER as LOYALTY_MEMBER comment='Indicates whether the shopper is enrolled in the loyalty program.' sample_values ('FALSE', 'TRUE'),
		SHOPPERS.SHOPPER_ID as SHOPPER_ID comment='Unique identifier for individual shoppers in the retail analytics system.' sample_values ('SHP000001', 'SHP000201', 'SHP000019'),
		SHOPPERS.HOME_STORE_ID as HOME_STORE_ID comment='Store the shopper visits most often (their home store).',
		SHOPPERS.ZIP3 as ZIP3 comment='First three digits of the shopper ZIP code.',
		SHOPPERS.LOYALTY_ENROLL_DATE as LOYALTY_ENROLL_DATE comment='Date the shopper joined the loyalty program. NULL for non-members.',
		STORES.REGION as REGION comment='Geographic regions where stores are located.' sample_values ('Southeast', 'Midwest', 'Northeast'),
		STORES.STORE_ID as STORE_ID comment='Unique identifier for each store location.' sample_values ('STR001', 'STR002', 'STR003'),
		STORES.STORE_NAME as STORE_NAME comment='The name of the retail store location.' sample_values ('Harbor View', 'Riverside Plaza', 'Downtown Market'),
		STORES.STORE_TYPE as STORE_TYPE comment='The classification of store locations based on their geographic setting or market area.' sample_values ('Urban', 'Rural', 'Suburban'),
		STORES.CITY as CITY,
		STORES.STATE as STATE comment='Two-letter US state code.',
		STORES.STORE_FORMAT as STORE_FORMAT comment='Urban Market, Supermarket or Neighborhood Market.',
		STORES.OPEN_DATE as OPEN_DATE comment='Date the store opened.',
		STORES.COMP_START_DATE as COMP_START_DATE comment='First date the store counts as a comparable (comp) store: 13 months after opening. Comp sales only include transactions on or after this date.',
		TRANSACTIONS.PAYMENT_METHOD as PAYMENT_METHOD,
		TRANSACTIONS.TXN_SHOPPER_ID as SHOPPER_ID comment='Foreign key to SHOPPERS. Group by SHOPPERS.SHOPPER_ID instead.',
		TRANSACTIONS.TXN_STORE_ID as STORE_ID comment='Foreign key to STORES. Group by STORES.STORE_ID instead.',
		TRANSACTIONS.TRANSACTION_ID as TRANSACTION_ID,
		TRANSACTIONS.CHANNEL as CHANNEL with synonyms=('fulfillment channel','omnichannel') comment='How the order was fulfilled: in_store, pickup or delivery.',
		TRANSACTIONS.HOUR_OF_DAY as HOUR(TRANSACTION_TS) with synonyms=('daypart','time of day') comment='Hour the transaction happened (0-23).',
		TRANSACTIONS.TXN_DATE_KEY as TRANSACTION_DATE comment='Join key to DIM_DATE. Use TRANSACTION_DATE for filtering.',
		TRANSACTIONS.TRANSACTION_DATE as TRANSACTION_DATE with synonyms=('date','sale date','purchase date') comment='Calendar date of the transaction. Use for all time-based filtering and trending.',
		TRANSACTIONS.TRANSACTION_TS as TRANSACTION_TS comment='Timestamp of the transaction.',
		TRANSACTION_ITEMS.ITEM_ID as ITEM_ID,
		TRANSACTION_ITEMS.TI_TRANSACTION_ID as TRANSACTION_ID comment='Foreign key on the line item.',
		TRANSACTION_ITEMS.TI_UPC as UPC comment='Foreign key on the line item.',
		TRANSACTION_ITEMS.TI_PROMOTION_ID as PROMOTION_ID comment='Promotion that priced this line; NULL when sold at shelf price.',
		VENDORS.VENDOR_ID as VENDOR_ID,
		VENDORS.VENDOR_NAME as VENDOR_NAME with synonyms=('supplier name','manufacturer'),
		VENDORS.VENDOR_TYPE as VENDOR_TYPE comment='manufacturer or grower',
		VENDORS.PAYMENT_TERMS as PAYMENT_TERMS,
		DIM_DATE.CALENDAR_DATE as CALENDAR_DATE,
		DIM_DATE.DAY_NAME as DAY_NAME with synonyms=('day of week'),
		DIM_DATE.IS_WEEKEND as IS_WEEKEND,
		DIM_DATE.FISCAL_YEAR as FISCAL_YEAR,
		DIM_DATE.FISCAL_QUARTER as FISCAL_QUARTER,
		DIM_DATE.FISCAL_PERIOD as FISCAL_PERIOD with synonyms=('fiscal month') comment='Fiscal month (1-12) on the 4-5-4 calendar.',
		DIM_DATE.FISCAL_WEEK as FISCAL_WEEK comment='Week of the fiscal year (1-52, 53 in long years).',
		DIM_DATE.FISCAL_YEAR_QUARTER as FISCAL_YEAR * 10 + FISCAL_QUARTER comment='Sortable fiscal quarter key, e.g. 20252 = fiscal 2025 Q2. The previous quarter is the next lower value.',
		DIM_DATE.FISCAL_YEAR_PERIOD as FISCAL_YEAR * 100 + FISCAL_PERIOD comment='Sortable fiscal period key, e.g. 202507 = fiscal 2025 period 7.',
		DIM_DATE.IS_HOLIDAY as IS_HOLIDAY,
		DIM_DATE.HOLIDAY_NAME as HOLIDAY_NAME,
		DIM_DATE.FISCAL_WEEK_START as FISCAL_WEEK_START comment='Sunday that starts the fiscal week.',
		DIM_DATE.SAME_DAY_LAST_YEAR as SAME_DAY_LAST_YEAR comment='Comparable day last year (364 days back, same weekday). Use for like-for-like YoY comparisons.',
		PROMOTIONS.PROMOTION_ID as PROMOTION_ID,
		PROMOTIONS.PROMOTION_NAME as PROMOTION_NAME,
		PROMOTIONS.PROMOTION_TYPE as PROMOTION_TYPE comment='TPR, DIGITAL_COUPON, LOYALTY_PRICE (members only) or BOGO.',
		PROMOTIONS.FUNDED_BY as FUNDED_BY comment='Who pays for the discount: vendor (trade funds) or retailer.',
		PROMOTIONS.PROMO_START_DATE as START_DATE,
		PROMOTIONS.PROMO_END_DATE as END_DATE,
		INVENTORY_DAILY.INV_STORE_ID as STORE_ID comment='Foreign key to STORES.',
		INVENTORY_DAILY.INV_UPC as UPC comment='Foreign key to PRODUCTS.',
		INVENTORY_DAILY.IS_OUT_OF_STOCK as IS_OUT_OF_STOCK with synonyms=('OOS') comment='TRUE when end-of-day on hand is zero.',
		INVENTORY_DAILY.INV_DATE_KEY as SNAPSHOT_DATE comment='Join key to DIM_DATE. Use SNAPSHOT_DATE for filtering.',
		INVENTORY_DAILY.SNAPSHOT_DATE as SNAPSHOT_DATE comment='Date of the end-of-day stock snapshot.',
		PURCHASE_ORDER_LINES.PO_ID as PO_ID,
		PURCHASE_ORDER_LINES.PO_LINE as PO_LINE,
		PURCHASE_ORDER_LINES.PO_VENDOR_ID as VENDOR_ID comment='Supplier on the order.',
		PURCHASE_ORDER_LINES.PO_STORE_ID as STORE_ID comment='Foreign key to STORES.',
		PURCHASE_ORDER_LINES.PO_UPC as UPC comment='Foreign key to PRODUCTS.',
		PURCHASE_ORDER_LINES.IS_OPEN as RECEIVED_DATE IS NULL comment='TRUE while the order line has not been received.',
		PURCHASE_ORDER_LINES.ORDER_DATE as ORDER_DATE,
		PURCHASE_ORDER_LINES.PROMISED_DATE as PROMISED_DATE,
		PURCHASE_ORDER_LINES.RECEIVED_DATE as RECEIVED_DATE,
		CAMPAIGNS.CAMPAIGN_ID as CAMPAIGN_ID,
		CAMPAIGNS.CAMPAIGN_NAME as CAMPAIGN_NAME,
		CAMPAIGNS.CAMPAIGN_TYPE as CAMPAIGN_TYPE comment='sponsored_listing, display_ad_onsite, display_ad_offsite or price_promotion.',
		CAMPAIGNS.CAMPAIGN_STATUS as STATUS,
		CAMPAIGNS.CAMPAIGN_TARGET_BRAND as TARGET_BRAND,
		CAMPAIGNS.CAMPAIGN_TARGET_CATEGORY as TARGET_CATEGORY,
		CAMPAIGNS.CAMPAIGN_START_DATE as START_DATE,
		CAMPAIGNS.CAMPAIGN_END_DATE as END_DATE,
		AD_DELIVERY_DAILY.AD_CAMPAIGN_ID as CAMPAIGN_ID comment='Foreign key to CAMPAIGNS.',
		AD_DELIVERY_DAILY.PLACEMENT as PLACEMENT comment='onsite_search, onsite_display, offsite_social or offsite_programmatic.',
		AD_DELIVERY_DAILY.AD_DATE_KEY as DELIVERY_DATE comment='Join key to DIM_DATE. Use DELIVERY_DATE for filtering.',
		AD_DELIVERY_DAILY.DELIVERY_DATE as DELIVERY_DATE,
		COHORTS.COHORT_ID as COHORT_ID,
		COHORTS.COHORT_NAME as COHORT_NAME with synonyms=('segment name','audience name'),
		COHORTS.COHORT_TYPE as COHORT_TYPE,
		COHORT_MEMBERS.CM_USER_ID as USER_ID,
		COHORT_MEMBERS.CM_COHORT_ID as COHORT_ID comment='Foreign key to COHORTS.',
		COHORT_MEMBERS.CM_SHOPPER_ID as SHOPPER_ID comment='Foreign key to SHOPPERS.'
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
		TRANSACTION_ITEMS.UNITS_PER_BASKET as SUM(TRANSACTION_ITEMS.QUANTITY) / NULLIF(COUNT(DISTINCT TRANSACTION_ITEMS.TI_TRANSACTION_ID), 0) with synonyms=('basket size','UPT') comment='Average units per transaction.',
		TRANSACTION_ITEMS.COGS as SUM(TRANSACTION_ITEMS.QUANTITY * TRANSACTION_ITEMS.UNIT_COST) with synonyms=('cost of goods sold','cost of sales') comment='Cost of goods sold. NULL for supplier roles, who are not entitled to cost.',
		TRANSACTION_ITEMS.GROSS_PROFIT as SUM(TRANSACTION_ITEMS.QUANTITY * (TRANSACTION_ITEMS.UNIT_PRICE - TRANSACTION_ITEMS.DISCOUNT)) - SUM(TRANSACTION_ITEMS.QUANTITY * TRANSACTION_ITEMS.UNIT_COST) with synonyms=('gross margin dollars','margin dollars','profit') comment='Net revenue minus cost of goods sold. NULL for supplier roles.',
		TRANSACTION_ITEMS.GROSS_MARGIN_PCT as (SUM(TRANSACTION_ITEMS.QUANTITY * (TRANSACTION_ITEMS.UNIT_PRICE - TRANSACTION_ITEMS.DISCOUNT)) - SUM(TRANSACTION_ITEMS.QUANTITY * TRANSACTION_ITEMS.UNIT_COST)) / NULLIF(SUM(TRANSACTION_ITEMS.QUANTITY * (TRANSACTION_ITEMS.UNIT_PRICE - TRANSACTION_ITEMS.DISCOUNT)), 0) with synonyms=('margin','margin rate','gross margin') comment='Gross profit as a share of net revenue (0-1). NULL for supplier roles.',
		TRANSACTION_ITEMS.PROMO_REVENUE as SUM(IFF(TRANSACTION_ITEMS.PROMOTION_ID IS NOT NULL, TRANSACTION_ITEMS.QUANTITY * TRANSACTION_ITEMS.UNIT_PRICE, 0)) with synonyms=('promoted sales','deal sales') comment='Gross revenue sold on promotion.',
		TRANSACTION_ITEMS.PROMO_SALES_SHARE as SUM(IFF(TRANSACTION_ITEMS.PROMOTION_ID IS NOT NULL, TRANSACTION_ITEMS.QUANTITY * TRANSACTION_ITEMS.UNIT_PRICE, 0)) / NULLIF(SUM(TRANSACTION_ITEMS.QUANTITY * TRANSACTION_ITEMS.UNIT_PRICE), 0) with synonyms=('promo penetration','percent on deal') comment='Share of gross revenue sold on promotion (0-1).',
		INVENTORY_DAILY.OUT_OF_STOCK_RATE as AVG(IFF(INVENTORY_DAILY.IS_OUT_OF_STOCK, 1, 0)) with synonyms=('OOS rate','stockout rate') comment='Share of store-product-days that ended with zero stock (0-1).',
		INVENTORY_DAILY.IN_STOCK_RATE as 1 - AVG(IFF(INVENTORY_DAILY.IS_OUT_OF_STOCK, 1, 0)) with synonyms=('in-stock %','availability') comment='Share of store-product-days with stock on hand (0-1).',
		INVENTORY_DAILY.AVG_ON_HAND_UNITS as AVG(INVENTORY_DAILY.ON_HAND_UNITS) comment='Average end-of-day units on hand per store-product-day. Correct way to summarise on hand over time.',
		INVENTORY_DAILY.AVG_DAYS_OF_SUPPLY as AVG(INVENTORY_DAILY.DAYS_OF_SUPPLY) with synonyms=('weeks of supply','cover') comment='Average days of supply.',
		INVENTORY_DAILY.TOTAL_UNITS_RECEIVED as SUM(INVENTORY_DAILY.UNITS_RECEIVED) comment='Units received into stores.',
		PURCHASE_ORDER_LINES.FILL_RATE as SUM(PURCHASE_ORDER_LINES.RECEIVED_UNITS) / NULLIF(SUM(IFF(PURCHASE_ORDER_LINES.RECEIVED_DATE IS NOT NULL, PURCHASE_ORDER_LINES.ORDERED_UNITS, 0)), 0) with synonyms=('unit fill rate','case fill') comment='Received units as a share of ordered units, on received order lines (0-1).',
		PURCHASE_ORDER_LINES.ON_TIME_RATE as AVG(IFF(PURCHASE_ORDER_LINES.RECEIVED_DATE IS NULL, NULL, IFF(PURCHASE_ORDER_LINES.RECEIVED_DATE <= PURCHASE_ORDER_LINES.PROMISED_DATE, 1, 0))) with synonyms=('OTD','on-time delivery') comment='Share of received order lines delivered on or before the promised date (0-1).',
		PURCHASE_ORDER_LINES.AVG_LEAD_TIME_DAYS as AVG(DATEDIFF(day, PURCHASE_ORDER_LINES.ORDER_DATE, PURCHASE_ORDER_LINES.RECEIVED_DATE)) with synonyms=('lead time') comment='Average actual days from order to receipt.',
		PURCHASE_ORDER_LINES.PO_COUNT as COUNT(DISTINCT PURCHASE_ORDER_LINES.PO_ID) comment='Number of purchase orders.',
		PURCHASE_ORDER_LINES.UNITS_ORDERED as SUM(PURCHASE_ORDER_LINES.ORDERED_UNITS) comment='Units ordered.',
		AD_DELIVERY_DAILY.TOTAL_IMPRESSIONS as SUM(AD_DELIVERY_DAILY.AD_IMPRESSIONS) comment='Ad impressions served.',
		AD_DELIVERY_DAILY.TOTAL_CLICKS as SUM(AD_DELIVERY_DAILY.AD_CLICKS) comment='Ad clicks.',
		AD_DELIVERY_DAILY.MEDIA_SPEND as SUM(AD_DELIVERY_DAILY.AD_SPEND) with synonyms=('ad spend') comment='Retail-media spend in dollars.',
		AD_DELIVERY_DAILY.CTR as SUM(AD_DELIVERY_DAILY.AD_CLICKS) / NULLIF(SUM(AD_DELIVERY_DAILY.AD_IMPRESSIONS), 0) with synonyms=('click through rate') comment='Click-through rate (0-1).',
		AD_DELIVERY_DAILY.ROAS as SUM(AD_DELIVERY_DAILY.ATTRIBUTED_SALES) / NULLIF(SUM(AD_DELIVERY_DAILY.AD_SPEND), 0) with synonyms=('return on ad spend') comment='Return on ad spend: attributed sales per dollar of media spend.',
		AD_DELIVERY_DAILY.TOTAL_ATTRIBUTED_SALES as SUM(AD_DELIVERY_DAILY.ATTRIBUTED_SALES) comment='Sales credited to campaigns (attribution, not incrementality).',
		COHORT_MEMBERS.COHORT_SHOPPERS as COUNT(DISTINCT COHORT_MEMBERS.CM_SHOPPER_ID) comment='Shoppers in the cohort.'
	)
	comment='View for RetailIQ an analytics and operations platform for retailers and their vendor partners'
	ai_sql_generation 'Revenue means gross revenue (REVENUE metric) unless the user explicitly asks for net. Always use the defined metrics instead of re-deriving formulas. Cost, COGS, gross profit and margin are retailer-confidential: they return NULL for supplier (brand or vendor) roles. If they come back NULL, say the user is not entitled to cost or margin data; never estimate them. INVENTORY_DAILY is a daily snapshot: never SUM on-hand or on-order units across dates - use AVG_ON_HAND_UNITS, or filter to one SNAPSHOT_DATE (the latest date for "current" stock). The data ends at MAX(TRANSACTIONS.TRANSACTION_DATE), which may be before CURRENT_DATE: anchor every relative period (last week, last month, last quarter, year to date) on that latest transaction date, not CURRENT_DATE. For fiscal weeks, periods, quarters or years, and for holidays, join to DIM_DATE. "Last fiscal quarter" is the FISCAL_YEAR_QUARTER immediately below the one containing the latest transaction date. For like-for-like year-over-year comparisons use DIM_DATE.SAME_DAY_LAST_YEAR. Comparable-store (comp) sales only include transactions on or after STORES.COMP_START_DATE. Sales per square foot = REVENUE divided by STORES.SQUARE_FEET for a single store; for several stores divide each store separately rather than summing square feet across transactions. ROAS and attributed sales are attribution, not incrementality; say so when asked about lift.'
	with extension (CA='{"tables":[{"name":"PRODUCTS","dimensions":[{"name":"BRAND"},{"name":"CATEGORY"},{"name":"PRODUCT_NAME"},{"name":"SUBCATEGORY"},{"name":"UPC"},{"name":"PRODUCT_VENDOR_ID"},{"name":"PACK_SIZE"}],"facts":[{"name":"PRICE"},{"name":"PRODUCT_UNIT_COST"}],"time_dimensions":[{"name":"LAUNCH_DATE"}]},{"name":"SHOPPERS","dimensions":[{"name":"AGE_GROUP"},{"name":"HOUSEHOLD_SIZE"},{"name":"INCOME_BRACKET"},{"name":"LOYALTY_MEMBER"},{"name":"SHOPPER_ID"},{"name":"HOME_STORE_ID"},{"name":"ZIP3"}],"time_dimensions":[{"name":"LOYALTY_ENROLL_DATE"}]},{"name":"STORES","dimensions":[{"name":"REGION"},{"name":"STORE_ID"},{"name":"STORE_NAME"},{"name":"STORE_TYPE"},{"name":"CITY"},{"name":"STATE"},{"name":"STORE_FORMAT"}],"facts":[{"name":"SQUARE_FEET"},{"name":"LATITUDE"},{"name":"LONGITUDE"}],"time_dimensions":[{"name":"OPEN_DATE"},{"name":"COMP_START_DATE"}]},{"name":"TRANSACTIONS","dimensions":[{"name":"PAYMENT_METHOD"},{"name":"TXN_SHOPPER_ID"},{"name":"TXN_STORE_ID"},{"name":"TRANSACTION_ID"},{"name":"CHANNEL"},{"name":"HOUR_OF_DAY"},{"name":"TXN_DATE_KEY"}],"metrics":[{"name":"ACTIVE_SHOPPERS"}],"time_dimensions":[{"name":"TRANSACTION_DATE"},{"name":"TRANSACTION_TS"}]},{"name":"TRANSACTION_ITEMS","dimensions":[{"name":"ITEM_ID"},{"name":"TI_TRANSACTION_ID"},{"name":"TI_UPC"},{"name":"TI_PROMOTION_ID"}],"facts":[{"name":"QUANTITY"},{"name":"DISCOUNT"},{"name":"UNIT_PRICE"},{"name":"UNIT_COST"}],"metrics":[{"name":"REVENUE"},{"name":"NET_REVENUE"},{"name":"DISCOUNT_AMOUNT"},{"name":"DISCOUNT_RATE"},{"name":"UNITS_SOLD"},{"name":"TRANSACTION_COUNT"},{"name":"AVG_BASKET_VALUE"},{"name":"UNITS_PER_BASKET"},{"name":"COGS"},{"name":"GROSS_PROFIT"},{"name":"GROSS_MARGIN_PCT"},{"name":"PROMO_REVENUE"},{"name":"PROMO_SALES_SHARE"}]},{"name":"VENDORS","dimensions":[{"name":"VENDOR_ID"},{"name":"VENDOR_NAME"},{"name":"VENDOR_TYPE"},{"name":"PAYMENT_TERMS"}],"facts":[{"name":"LEAD_TIME_DAYS"}]},{"name":"DIM_DATE","dimensions":[{"name":"CALENDAR_DATE"},{"name":"DAY_NAME"},{"name":"IS_WEEKEND"},{"name":"FISCAL_YEAR"},{"name":"FISCAL_QUARTER"},{"name":"FISCAL_PERIOD"},{"name":"FISCAL_WEEK"},{"name":"FISCAL_YEAR_QUARTER"},{"name":"FISCAL_YEAR_PERIOD"},{"name":"IS_HOLIDAY"},{"name":"HOLIDAY_NAME"}],"time_dimensions":[{"name":"FISCAL_WEEK_START"},{"name":"SAME_DAY_LAST_YEAR"}]},{"name":"PROMOTIONS","dimensions":[{"name":"PROMOTION_ID"},{"name":"PROMOTION_NAME"},{"name":"PROMOTION_TYPE"},{"name":"FUNDED_BY"}],"facts":[{"name":"DISCOUNT_PCT"}],"time_dimensions":[{"name":"PROMO_START_DATE"},{"name":"PROMO_END_DATE"}]},{"name":"INVENTORY_DAILY","dimensions":[{"name":"INV_STORE_ID"},{"name":"INV_UPC"},{"name":"IS_OUT_OF_STOCK"},{"name":"INV_DATE_KEY"}],"facts":[{"name":"ON_HAND_UNITS"},{"name":"ON_ORDER_UNITS"},{"name":"INV_UNITS_SOLD"},{"name":"UNITS_RECEIVED"},{"name":"DAYS_OF_SUPPLY"}],"metrics":[{"name":"OUT_OF_STOCK_RATE"},{"name":"IN_STOCK_RATE"},{"name":"AVG_ON_HAND_UNITS"},{"name":"AVG_DAYS_OF_SUPPLY"},{"name":"TOTAL_UNITS_RECEIVED"}],"time_dimensions":[{"name":"SNAPSHOT_DATE"}]},{"name":"PURCHASE_ORDER_LINES","dimensions":[{"name":"PO_ID"},{"name":"PO_LINE"},{"name":"PO_VENDOR_ID"},{"name":"PO_STORE_ID"},{"name":"PO_UPC"},{"name":"IS_OPEN"}],"facts":[{"name":"ORDERED_UNITS"},{"name":"RECEIVED_UNITS"},{"name":"PO_UNIT_COST"}],"metrics":[{"name":"FILL_RATE"},{"name":"ON_TIME_RATE"},{"name":"AVG_LEAD_TIME_DAYS"},{"name":"PO_COUNT"},{"name":"UNITS_ORDERED"}],"time_dimensions":[{"name":"ORDER_DATE"},{"name":"PROMISED_DATE"},{"name":"RECEIVED_DATE"}]},{"name":"CAMPAIGNS","dimensions":[{"name":"CAMPAIGN_ID"},{"name":"CAMPAIGN_NAME"},{"name":"CAMPAIGN_TYPE"},{"name":"CAMPAIGN_STATUS"},{"name":"CAMPAIGN_TARGET_BRAND"},{"name":"CAMPAIGN_TARGET_CATEGORY"}],"time_dimensions":[{"name":"CAMPAIGN_START_DATE"},{"name":"CAMPAIGN_END_DATE"}]},{"name":"AD_DELIVERY_DAILY","dimensions":[{"name":"AD_CAMPAIGN_ID"},{"name":"PLACEMENT"},{"name":"AD_DATE_KEY"}],"facts":[{"name":"AD_IMPRESSIONS"},{"name":"AD_CLICKS"},{"name":"AD_CONVERSIONS"},{"name":"AD_SPEND"},{"name":"ATTRIBUTED_SALES"}],"metrics":[{"name":"TOTAL_IMPRESSIONS"},{"name":"TOTAL_CLICKS"},{"name":"MEDIA_SPEND"},{"name":"CTR"},{"name":"ROAS"},{"name":"TOTAL_ATTRIBUTED_SALES"}],"time_dimensions":[{"name":"DELIVERY_DATE"}]},{"name":"COHORTS","dimensions":[{"name":"COHORT_ID"},{"name":"COHORT_NAME"},{"name":"COHORT_TYPE"}]},{"name":"COHORT_MEMBERS","dimensions":[{"name":"CM_USER_ID"},{"name":"CM_COHORT_ID"},{"name":"CM_SHOPPER_ID"}],"metrics":[{"name":"COHORT_SHOPPERS"}]}],"relationships":[{"name":"TI_TO_TXN"},{"name":"TI_TO_PRODUCT"},{"name":"TXN_TO_SHOPPER"},{"name":"TXN_TO_STORE"},{"name":"TXN_TO_DATE"},{"name":"PRODUCT_TO_VENDOR"},{"name":"TI_TO_PROMOTION"},{"name":"INV_TO_STORE"},{"name":"INV_TO_PRODUCT"},{"name":"INV_TO_DATE"},{"name":"PO_TO_STORE"},{"name":"PO_TO_PRODUCT"},{"name":"AD_TO_CAMPAIGN"},{"name":"AD_TO_DATE"},{"name":"CM_TO_COHORT"},{"name":"CM_TO_SHOPPER"}]}');

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
