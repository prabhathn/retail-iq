"""
Synthetic Data Generator for RetailIQ Platform

Uses write_pandas() for fast bulk loading into Snowflake.
"""

import os
import sys
import random
from datetime import datetime, timedelta
from dotenv import load_dotenv
import snowflake.connector
from snowflake.connector.pandas_tools import write_pandas
import pandas as pd
import numpy as np

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

load_dotenv()

# Snowflake connection
#
# This script creates and replaces tables, so it needs more privilege than the
# application itself. The app's PAT authenticates as a user whose default role is
# whatever their Snowflake default happens to be (often not an admin role), which
# fails with "must have CREATE SCHEMA granted on DATABASE".
#
# SNOWFLAKE_SETUP_ROLE therefore defaults to ACCOUNTADMIN. The application never
# uses this role - app queries pass an explicit RETAILIQ_ROLE_* so that row access
# policies apply.
SETUP_ROLE = os.getenv("SNOWFLAKE_SETUP_ROLE", "ACCOUNTADMIN")


def get_connection(role: str = None):
    return snowflake.connector.connect(
        account=os.getenv("SNOWFLAKE_ACCOUNT"),
        user=os.getenv("SNOWFLAKE_USER"),
        password=os.getenv("SNOWFLAKE_PASSWORD"),
        database=os.getenv("SNOWFLAKE_DATABASE", "RETAILIQ_ANALYTICS"),
        schema=os.getenv("SNOWFLAKE_SCHEMA", "PUBLIC"),
        warehouse=os.getenv("SNOWFLAKE_WAREHOUSE", "RETAILIQ_WH"),
        role=role or SETUP_ROLE,
    )

# Data templates
CATEGORIES = {
    "Produce": {
        "subcategories": ["Fresh Fruits", "Fresh Vegetables", "Organic", "Salads"],
        "brands": ["Dole", "Driscoll's", "Earthbound Farm", "Green Giant", "Del Monte", "Chiquita"],
        "products": [
            ("Bananas", 0.59), ("Apples", 1.99), ("Oranges", 1.49), ("Strawberries", 4.99),
            ("Blueberries", 5.99), ("Grapes", 3.99), ("Lettuce", 2.49), ("Tomatoes", 2.99),
            ("Carrots", 1.99), ("Broccoli", 2.49), ("Spinach", 3.99), ("Avocados", 1.99),
            ("Lemons", 0.69), ("Onions", 1.29), ("Potatoes", 3.99), ("Bell Peppers", 1.49)
        ]
    },
    "Dairy": {
        "subcategories": ["Milk", "Cheese", "Yogurt", "Butter & Eggs"],
        "brands": ["Horizon", "Organic Valley", "Tillamook", "Chobani", "Yoplait", "Kraft", "Land O'Lakes"],
        "products": [
            ("Whole Milk 1 Gallon", 4.99), ("2% Milk 1 Gallon", 4.79), ("Skim Milk 1 Gallon", 4.49),
            ("Cheddar Cheese 8oz", 4.99), ("Mozzarella 8oz", 4.49), ("Greek Yogurt 32oz", 5.99),
            ("Butter 1lb", 5.49), ("Eggs Large Dozen", 4.99), ("Cream Cheese 8oz", 3.49),
            ("Sour Cream 16oz", 2.99), ("Half & Half 32oz", 4.29), ("Heavy Cream 16oz", 4.99)
        ]
    },
    "Bakery": {
        "subcategories": ["Bread", "Pastries", "Cakes", "Tortillas"],
        "brands": ["Sara Lee", "Nature's Own", "Dave's Killer Bread", "Pepperidge Farm", "Thomas'", "Arnold"],
        "products": [
            ("White Bread Loaf", 3.49), ("Wheat Bread Loaf", 3.99), ("Sourdough Loaf", 4.99),
            ("Bagels 6ct", 4.49), ("English Muffins 6ct", 3.99), ("Croissants 4ct", 5.99),
            ("Hamburger Buns 8ct", 3.49), ("Hot Dog Buns 8ct", 3.29), ("Tortillas 10ct", 3.99),
            ("Dinner Rolls 12ct", 4.49), ("Ciabatta Bread", 4.99), ("Rye Bread", 4.49)
        ]
    },
    "Meat & Seafood": {
        "subcategories": ["Beef", "Chicken", "Pork", "Seafood", "Deli"],
        "brands": ["Perdue", "Tyson", "Oscar Mayer", "Boar's Head", "Hormel", "Smithfield"],
        "products": [
            ("Ground Beef 1lb", 6.99), ("Chicken Breast 1lb", 5.99), ("Pork Chops 1lb", 5.49),
            ("Bacon 16oz", 7.99), ("Salmon Fillet 1lb", 12.99), ("Shrimp 1lb", 11.99),
            ("Turkey Breast Deli", 8.99), ("Ham Deli", 7.99), ("Ribeye Steak", 14.99),
            ("Ground Turkey 1lb", 5.49), ("Chicken Thighs 1lb", 4.99), ("Sausage Links 16oz", 5.99)
        ]
    },
    "Frozen": {
        "subcategories": ["Frozen Meals", "Ice Cream", "Frozen Vegetables", "Frozen Pizza"],
        "brands": ["DiGiorno", "Stouffer's", "Birds Eye", "Green Giant", "Ben & Jerry's", "Häagen-Dazs", "Lean Cuisine"],
        "products": [
            ("Frozen Pizza", 7.99), ("Ice Cream Pint", 5.99), ("Frozen Vegetables 16oz", 2.99),
            ("Frozen Waffles 10ct", 4.49), ("Frozen Burritos 8ct", 6.99), ("Fish Sticks 24ct", 7.99),
            ("Frozen Lasagna", 9.99), ("Ice Cream Sandwiches 6ct", 5.49), ("Frozen Fruit 16oz", 4.99),
            ("Chicken Nuggets 32oz", 8.99), ("Frozen Fries 32oz", 4.49), ("Pot Pies 4ct", 6.99)
        ]
    },
    "Beverages": {
        "subcategories": ["Soft Drinks", "Juice", "Water", "Coffee & Tea", "Sports Drinks"],
        "brands": ["Coca-Cola", "Pepsi", "Tropicana", "Minute Maid", "Starbucks", "Gatorade", "Poland Spring"],
        "products": [
            ("Cola 12pk Cans", 6.99), ("Orange Juice 64oz", 4.99), ("Bottled Water 24pk", 5.99),
            ("Coffee Grounds 12oz", 8.99), ("Iced Tea 12pk", 6.49), ("Sports Drink 8pk", 7.99),
            ("Apple Juice 64oz", 3.99), ("Sparkling Water 12pk", 5.99), ("Energy Drink 4pk", 7.99),
            ("Lemonade 64oz", 3.49), ("Green Tea 12pk", 5.99), ("Cold Brew Coffee 48oz", 9.99)
        ]
    },
    "Snacks": {
        "subcategories": ["Chips", "Crackers", "Nuts", "Candy", "Cookies"],
        "brands": ["Lay's", "Doritos", "Oreo", "Nabisco", "Planters", "Hershey's", "M&M's", "Ritz"],
        "products": [
            ("Potato Chips 10oz", 4.49), ("Tortilla Chips 13oz", 4.99), ("Crackers 16oz", 4.29),
            ("Mixed Nuts 16oz", 9.99), ("Chocolate Bar", 1.99), ("Cookies 14oz", 4.99),
            ("Pretzels 16oz", 3.99), ("Popcorn 3pk", 4.49), ("Trail Mix 16oz", 7.99),
            ("Granola Bars 8ct", 4.49), ("Cheese Crackers 12oz", 4.29), ("Candy Bar 6pk", 5.99)
        ]
    },
    "Pantry": {
        "subcategories": ["Canned Goods", "Pasta & Rice", "Sauces", "Baking", "Condiments"],
        "brands": ["Campbell's", "Barilla", "Hunt's", "Kraft", "Heinz", "Hidden Valley", "McCormick"],
        "products": [
            ("Pasta 16oz", 1.99), ("Rice 2lb", 3.99), ("Tomato Sauce 24oz", 2.49),
            ("Chicken Soup", 2.29), ("Peanut Butter 16oz", 4.49), ("Ketchup 32oz", 4.29),
            ("Mayonnaise 30oz", 5.49), ("Olive Oil 17oz", 8.99), ("Cereal 18oz", 4.99),
            ("Flour 5lb", 4.49), ("Sugar 4lb", 3.99), ("Canned Beans 15oz", 1.49),
            ("Pasta Sauce 24oz", 3.99), ("Salad Dressing 16oz", 3.99), ("Honey 12oz", 6.99)
        ]
    },
    "Household": {
        "subcategories": ["Cleaning", "Paper Products", "Laundry", "Storage"],
        "brands": ["Bounty", "Charmin", "Tide", "Clorox", "Glad", "Dawn", "Lysol", "Swiffer"],
        "products": [
            ("Paper Towels 6pk", 12.99), ("Toilet Paper 12pk", 14.99), ("Dish Soap 28oz", 4.49),
            ("Laundry Detergent 100oz", 14.99), ("All-Purpose Cleaner", 4.99), ("Trash Bags 45ct", 12.99),
            ("Aluminum Foil 75ft", 5.99), ("Plastic Wrap 200ft", 4.49), ("Sponges 6pk", 4.99),
            ("Dryer Sheets 120ct", 7.99), ("Glass Cleaner 26oz", 4.49), ("Disinfecting Wipes 75ct", 5.99)
        ]
    },
    "Health & Beauty": {
        "subcategories": ["Personal Care", "Oral Care", "Hair Care", "Medicine"],
        "brands": ["Dove", "Crest", "Colgate", "Pantene", "Head & Shoulders", "Tylenol", "Advil"],
        "products": [
            ("Shampoo 12oz", 6.99), ("Conditioner 12oz", 6.99), ("Body Wash 18oz", 7.49),
            ("Toothpaste 6oz", 4.99), ("Deodorant", 5.99), ("Hand Soap 12oz", 3.99),
            ("Lotion 16oz", 8.99), ("Mouthwash 33oz", 6.99), ("Pain Reliever 100ct", 9.99),
            ("Vitamins 100ct", 12.99), ("Razors 8ct", 14.99), ("Sunscreen 8oz", 10.99)
        ]
    }
}

STORES = [
    ("STR001", "Downtown Market", "Northeast", "Urban"),
    ("STR002", "Riverside Plaza", "Northeast", "Suburban"),
    ("STR003", "Hillside Center", "Southeast", "Suburban"),
    ("STR004", "Harbor View", "Southeast", "Urban"),
    ("STR005", "Mountain Ridge", "Midwest", "Rural"),
    ("STR006", "Lakefront", "Midwest", "Suburban"),
    ("STR007", "Valley Junction", "Southwest", "Urban"),
    ("STR008", "Desert Springs", "Southwest", "Suburban"),
    ("STR009", "Pacific Heights", "West", "Urban"),
    ("STR010", "Coastal Plaza", "West", "Suburban"),
    ("STR011", "Metro Center", "Northeast", "Urban"),
    ("STR012", "Garden District", "Southeast", "Urban"),
    ("STR013", "Prairie View", "Midwest", "Rural"),
    ("STR014", "Canyon Road", "Southwest", "Rural"),
    ("STR015", "Bayshore Mall", "West", "Urban")
]

def create_schema(cursor):
    """Create the Snowflake schema for RetailIQ analytics"""
    
    print("Creating database and schema...")
    cursor.execute("CREATE DATABASE IF NOT EXISTS RETAILIQ_ANALYTICS")
    cursor.execute("USE DATABASE RETAILIQ_ANALYTICS")
    cursor.execute("CREATE SCHEMA IF NOT EXISTS PUBLIC")
    cursor.execute("USE SCHEMA PUBLIC")
    
    print("Creating tables...")
    
    # Products table
    cursor.execute("""
        CREATE OR REPLACE TABLE products (
            upc VARCHAR(20) PRIMARY KEY,
            product_name VARCHAR(255) NOT NULL,
            brand VARCHAR(100),
            category VARCHAR(100) NOT NULL,
            subcategory VARCHAR(100),
            price DECIMAL(10, 2) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
        )
    """)
    
    # Stores table
    cursor.execute("""
        CREATE OR REPLACE TABLE stores (
            store_id VARCHAR(20) PRIMARY KEY,
            store_name VARCHAR(255) NOT NULL,
            region VARCHAR(50) NOT NULL,
            store_type VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
        )
    """)
    
    # Shoppers table
    cursor.execute("""
        CREATE OR REPLACE TABLE shoppers (
            shopper_id VARCHAR(20) PRIMARY KEY,
            age_group VARCHAR(20),
            household_size INT,
            income_bracket VARCHAR(20),
            loyalty_member BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
        )
    """)
    
    # Transactions table
    cursor.execute("""
        CREATE OR REPLACE TABLE transactions (
            transaction_id VARCHAR(30) PRIMARY KEY,
            shopper_id VARCHAR(20) NOT NULL,
            store_id VARCHAR(20) NOT NULL,
            transaction_date DATE NOT NULL,
            payment_method VARCHAR(20),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
        )
    """)
    
    # Transaction items table
    cursor.execute("""
        CREATE OR REPLACE TABLE transaction_items (
            item_id VARCHAR(40) PRIMARY KEY,
            transaction_id VARCHAR(30) NOT NULL,
            upc VARCHAR(20) NOT NULL,
            quantity INT NOT NULL,
            unit_price DECIMAL(10, 2) NOT NULL,
            discount DECIMAL(10, 2) DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
        )
    """)
    
    # Role entitlements table for RBAC (uses CURRENT_ROLE() for role-based access)
    cursor.execute("""
        CREATE OR REPLACE TABLE role_entitlements (
            role_name VARCHAR(100) NOT NULL,
            tenant_type VARCHAR(50) NOT NULL,
            tenant_id VARCHAR(255),
            created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
        )
    """)
    
    # Cohort members table (for shopper cohorts feature)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS cohort_members (
            user_id INTEGER NOT NULL,
            cohort_id INTEGER NOT NULL,
            shopper_id VARCHAR(50) NOT NULL,
            created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
            PRIMARY KEY (user_id, cohort_id, shopper_id)
        )
    """)
    
    print("Tables created successfully!")

def create_row_access_policies(cursor):
    """Create Row Access Policies for role-based data access control
    
    Uses CURRENT_ROLE() to check the active Snowflake role against role_entitlements.
    Roles are set at connection time via the 'role' parameter in snowflake.connector.connect().
    """
    
    print("Creating Row Access Policies...")
    
    # First, drop any existing policies that might be blocking data
    try:
        cursor.execute("ALTER TABLE products DROP ROW ACCESS POLICY products_policy")
        print("  Dropped existing products_policy from table")
    except:
        pass
    
    try:
        cursor.execute("ALTER TABLE transactions DROP ROW ACCESS POLICY transactions_policy")
        print("  Dropped existing transactions_policy from table")
    except:
        pass
    
    try:
        cursor.execute("ALTER TABLE transaction_items DROP ROW ACCESS POLICY transaction_items_policy")
        print("  Dropped existing transaction_items_policy from table")
    except:
        pass
    
    # Drop policy definitions
    try:
        cursor.execute("DROP ROW ACCESS POLICY IF EXISTS products_policy")
        cursor.execute("DROP ROW ACCESS POLICY IF EXISTS transactions_policy")
        cursor.execute("DROP ROW ACCESS POLICY IF EXISTS transaction_items_policy")
        print("  Dropped old policy definitions")
    except:
        pass
    
    # Products policy - filters by category or brand based on role entitlements
    # Uses CURRENT_ROLE() instead of GETVARIABLE('SCOPE')
    cursor.execute("""
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
          )
    """)
    
    # Apply policy to products table
    cursor.execute("ALTER TABLE products ADD ROW ACCESS POLICY products_policy ON (category, brand)")
    print("  ✓ Products policy created and applied")
    
    # Transactions policy - allows access if user has 'all' access or access to products in transaction
    cursor.execute("""
        CREATE OR REPLACE ROW ACCESS POLICY transactions_policy 
        AS (txn_id VARCHAR) 
        RETURNS BOOLEAN ->
          COALESCE(
            -- Full access role (tenant_type = 'all')
            EXISTS (
              SELECT 1 FROM role_entitlements 
              WHERE role_name = CURRENT_ROLE()
              AND tenant_type = 'all'
            )
            OR
            -- Has access to at least one product in the transaction
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
          )
    """)
    
    # Apply policy to transactions table
    cursor.execute("ALTER TABLE transactions ADD ROW ACCESS POLICY transactions_policy ON (transaction_id)")
    print("  ✓ Transactions policy created and applied")
    
    # Transaction items policy - filters based on product access
    cursor.execute("""
        CREATE OR REPLACE ROW ACCESS POLICY transaction_items_policy 
        AS (upc_val VARCHAR) 
        RETURNS BOOLEAN ->
          COALESCE(
            -- Full access role
            EXISTS (
              SELECT 1 FROM role_entitlements 
              WHERE role_name = CURRENT_ROLE()
              AND tenant_type = 'all'
            )
            OR
            -- Has access to the specific product
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
          )
    """)
    
    # Apply policy to transaction_items table
    cursor.execute("ALTER TABLE transaction_items ADD ROW ACCESS POLICY transaction_items_policy ON (upc)")
    print("  ✓ Transaction items policy created and applied")
    
    print("Row Access Policies created successfully!")

def generate_products_df():
    """Generate product data as DataFrame"""
    products = []
    upc_counter = 100000000000
    
    for category, data in CATEGORIES.items():
        for product_name, base_price in data["products"]:
            for brand in random.sample(data["brands"], min(2, len(data["brands"]))):
                upc = str(upc_counter)
                upc_counter += 1
                
                price = round(base_price * random.uniform(0.9, 1.2), 2)
                subcategory = random.choice(data["subcategories"])
                full_name = f"{brand} {product_name}"
                
                products.append({
                    "UPC": upc,
                    "PRODUCT_NAME": full_name,
                    "BRAND": brand,
                    "CATEGORY": category,
                    "SUBCATEGORY": subcategory,
                    "PRICE": price
                })
    
    return pd.DataFrame(products)

def generate_stores_df():
    """Generate stores data as DataFrame"""
    stores = []
    for store_id, store_name, region, store_type in STORES:
        stores.append({
            "STORE_ID": store_id,
            "STORE_NAME": store_name,
            "REGION": region,
            "STORE_TYPE": store_type
        })
    return pd.DataFrame(stores)

def generate_shoppers_df(num_shoppers=5000):
    """Generate shopper data as DataFrame"""
    age_groups = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"]
    income_brackets = ["Under $30K", "$30K-$50K", "$50K-$75K", "$75K-$100K", "$100K-$150K", "Over $150K"]
    
    np.random.seed(42)
    
    shoppers = []
    for i in range(num_shoppers):
        shoppers.append({
            "SHOPPER_ID": f"SHP{str(i+1).zfill(6)}",
            "AGE_GROUP": np.random.choice(age_groups, p=[0.1, 0.2, 0.25, 0.2, 0.15, 0.1]),
            "HOUSEHOLD_SIZE": int(np.random.choice([1, 2, 3, 4, 5], p=[0.2, 0.3, 0.25, 0.18, 0.07])),
            "INCOME_BRACKET": np.random.choice(income_brackets, p=[0.15, 0.2, 0.25, 0.2, 0.12, 0.08]),
            "LOYALTY_MEMBER": bool(random.random() < 0.6)
        })
    
    return pd.DataFrame(shoppers)

def generate_transactions_for_dates(
    products_df,
    shoppers_df,
    stores_df,
    dates,
    transaction_counter=1,
    item_counter=1,
    progress_every=30,
):
    """Generate transactions and line items for an explicit list of dates.

    This is the single source of truth for basket composition, pricing, discount
    rate, and weekday/weekend volume. Both the initial load and the incremental
    top-up (extend_synthetic_data.py) call it, so topped-up days cannot drift
    statistically from the original history.

    Args:
        dates: list of datetime/date objects to generate for.
        transaction_counter: first TXN sequence number to use. The top-up passes
            MAX(existing)+1 so appended IDs never collide with existing rows.
        item_counter: first ITM sequence number to use, same reasoning.

    Returns:
        (transactions_df, transaction_items_df, next_transaction_counter,
         next_item_counter)
    """
    payment_methods = ["Credit", "Debit", "Cash", "Mobile"]

    # Pre-compute product lists by category
    products_by_category = {}
    for _, row in products_df.iterrows():
        cat = row["CATEGORY"]
        if cat not in products_by_category:
            products_by_category[cat] = []
        products_by_category[cat].append(row)

    all_products = products_df.to_dict('records')
    all_shoppers = shoppers_df["SHOPPER_ID"].tolist()
    all_stores = stores_df["STORE_ID"].tolist()
    categories = list(products_by_category.keys()) or list(CATEGORIES.keys())

    transactions = []
    transaction_items = []
    total_days = len(dates)

    for day_index, current_date in enumerate(dates):
        day_of_week = current_date.weekday()

        # More transactions on weekends
        if day_of_week >= 5:
            num_daily_transactions = random.randint(800, 1500)
        else:
            num_daily_transactions = random.randint(500, 1000)

        for _ in range(num_daily_transactions):
            transaction_id = f"TXN{str(transaction_counter).zfill(10)}"
            transaction_counter += 1

            shopper_id = random.choice(all_shoppers)
            store_id = random.choice(all_stores)
            payment = random.choice(payment_methods)

            transactions.append({
                "TRANSACTION_ID": transaction_id,
                "SHOPPER_ID": shopper_id,
                "STORE_ID": store_id,
                "TRANSACTION_DATE": current_date.strftime("%Y-%m-%d"),
                "PAYMENT_METHOD": payment
            })

            # Generate basket items
            num_items = random.randint(3, 15)
            basket_categories = random.sample(categories, min(num_items, len(categories)))

            for _ in range(num_items):
                category = random.choice(basket_categories)
                cat_products = products_by_category.get(category, all_products)
                product = random.choice(cat_products)

                quantity = random.choices([1, 2, 3, 4, 5], weights=[50, 30, 12, 5, 3])[0]
                unit_price = float(product["PRICE"])

                discount = 0.0
                if random.random() < 0.15:
                    discount = round(unit_price * random.uniform(0.1, 0.3), 2)

                item_id = f"ITM{str(item_counter).zfill(12)}"
                item_counter += 1

                transaction_items.append({
                    "ITEM_ID": item_id,
                    "TRANSACTION_ID": transaction_id,
                    "UPC": product["UPC"],
                    "QUANTITY": quantity,
                    "UNIT_PRICE": unit_price,
                    "DISCOUNT": discount
                })

        if progress_every and (day_index + 1) % progress_every == 0:
            print(f"  Generated {day_index + 1}/{total_days} days...")

    return (
        pd.DataFrame(transactions),
        pd.DataFrame(transaction_items),
        transaction_counter,
        item_counter,
    )


def generate_transactions_df(products_df, shoppers_df, stores_df, num_days=365):
    """Generate the initial year of transaction data, ending today."""
    print("Generating transactions (this may take a moment)...")

    start_date = datetime.now() - timedelta(days=num_days)
    dates = [start_date + timedelta(days=i) for i in range(num_days)]

    transactions_df, items_df, _, _ = generate_transactions_for_dates(
        products_df, shoppers_df, stores_df, dates
    )
    return transactions_df, items_df

def main():
    print("=" * 60)
    print("RetailIQ - Synthetic Data Generator")
    print("Using write_pandas() for fast bulk loading")
    print("=" * 60)
    
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        # Create schema
        create_schema(cursor)
        
        # Generate DataFrames
        print("\nGenerating synthetic data...")
        
        products_df = generate_products_df()
        print(f"  ✓ Generated {len(products_df)} products")
        
        stores_df = generate_stores_df()
        print(f"  ✓ Generated {len(stores_df)} stores")
        
        shoppers_df = generate_shoppers_df(5000)
        print(f"  ✓ Generated {len(shoppers_df)} shoppers")
        
        transactions_df, transaction_items_df = generate_transactions_df(
            products_df, shoppers_df, stores_df, num_days=365
        )
        print(f"  ✓ Generated {len(transactions_df)} transactions")
        print(f"  ✓ Generated {len(transaction_items_df)} transaction items")
        
        # Load data using write_pandas (much faster than INSERT)
        #
        # IMPORTANT: do NOT pass overwrite=True here. write_pandas(overwrite=True)
        # replaces the target table and lets the connector infer column types from
        # the DataFrame, which silently discarded the typed DDL created above (and
        # in snowflake_setup.sql): transaction_date came back as TEXT instead of
        # DATE, and the created_at columns disappeared entirely.
        #
        # A TEXT transaction_date still compares correctly for ISO strings, so
        # nothing looked broken - but it forces an implicit cast on every date
        # filter, prevents pruning on the date column, and makes Cortex Analyst
        # reason about the cast before it can answer a time-based question.
        #
        # Truncating and appending keeps the declared schema intact.
        print("\nLoading data into Snowflake using write_pandas...")

        load_plan = [
            ("PRODUCTS", products_df, "products"),
            ("STORES", stores_df, "stores"),
            ("SHOPPERS", shoppers_df, "shoppers"),
            ("TRANSACTIONS", transactions_df, "transactions"),
            ("TRANSACTION_ITEMS", transaction_items_df, "transaction items (this is the big one)"),
        ]

        for table, df, label in load_plan:
            print(f"  Loading {label}...")
            cursor.execute(f"TRUNCATE TABLE IF EXISTS {table}")
            success, _, nrows, _ = write_pandas(
                conn, df, table, auto_create_table=False, overwrite=False
            )
            if not success:
                raise RuntimeError(f"write_pandas failed for {table}")
            print(f"    ✓ {nrows:,} rows")
        
        print("\n" + "=" * 60)
        print("✅ Data generation complete!")
        print("=" * 60)
        
        # Create Row Access Policies
        print("\n")
        create_row_access_policies(cursor)
        
        # Insert demo role entitlements (using role names that match Snowflake roles)
        print("\nInserting demo role entitlements...")
        cursor.execute("DELETE FROM role_entitlements")  # Clear existing
        
        # RETAILIQ_ROLE_ADMIN: Administrator - full access
        cursor.execute("INSERT INTO role_entitlements (role_name, tenant_type, tenant_id) VALUES ('RETAILIQ_ROLE_ADMIN', 'all', NULL)")
        
        # RETAILIQ_ROLE_DAIRY_MANAGER: Dairy Category Manager
        cursor.execute("INSERT INTO role_entitlements (role_name, tenant_type, tenant_id) VALUES ('RETAILIQ_ROLE_DAIRY_MANAGER', 'category', 'Dairy')")
        
        # RETAILIQ_ROLE_KRAFT_VENDOR: Kraft Vendor
        cursor.execute("INSERT INTO role_entitlements (role_name, tenant_type, tenant_id) VALUES ('RETAILIQ_ROLE_KRAFT_VENDOR', 'brand', 'Kraft')")
        
        # RETAILIQ_ROLE_BEV_SNACKS: Beverages & Snacks Team (multiple categories)
        cursor.execute("INSERT INTO role_entitlements (role_name, tenant_type, tenant_id) VALUES ('RETAILIQ_ROLE_BEV_SNACKS', 'category', 'Beverages')")
        cursor.execute("INSERT INTO role_entitlements (role_name, tenant_type, tenant_id) VALUES ('RETAILIQ_ROLE_BEV_SNACKS', 'category', 'Snacks')")
        
        # RETAILIQ_ROLE_PRODUCE_MANAGER: Produce Manager
        cursor.execute("INSERT INTO role_entitlements (role_name, tenant_type, tenant_id) VALUES ('RETAILIQ_ROLE_PRODUCE_MANAGER', 'category', 'Produce')")
        
        # RETAILIQ_ROLE_COCACOLA_VENDOR: Coca-Cola Vendor
        cursor.execute("INSERT INTO role_entitlements (role_name, tenant_type, tenant_id) VALUES ('RETAILIQ_ROLE_COCACOLA_VENDOR', 'brand', 'Coca-Cola')")
        
        conn.commit()
        print("  ✓ Demo role entitlements inserted")
        
        # Verify counts - demonstrate RAPs working
        print("\n" + "=" * 60)
        print("Verifying Row Access Policies (Role-Based)")
        print("=" * 60)
        
        # Tables without RAPs (always visible)
        print("\nTables without RAPs (always visible):")
        for table in ["stores", "shoppers", "role_entitlements"]:
            cursor.execute(f"SELECT COUNT(*) FROM {table}")
            count = cursor.fetchone()[0]
            print(f"  {table}: {count:,} rows")
        
        # Note: To fully test role-based RAPs, you need to:
        # 1. Run snowflake_setup.sql to create the roles and grants
        # 2. Grant roles to your service account user
        # 3. Connect with a specific role to test filtering
        print("\nNote: To test role-based filtering:")
        print("  1. Run snowflake_setup.sql to create roles")
        print("  2. Grant roles to your service account")
        print("  3. Connect with role parameter to test")
        print("\nExample connection with role:")
        print("  conn = snowflake.connector.connect(..., role='RETAILIQ_ROLE_ADMIN')")
        print("  conn = snowflake.connector.connect(..., role='ROLE_DAIRY_MANAGER')")
        
        print("\n✅ Role entitlements and Row Access Policies created!")
        
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    main()
