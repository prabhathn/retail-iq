"""
Initialize PostgreSQL database with all tables and demo data.

This is the main initialization script for a clean installation.
It creates all necessary tables and seeds demo data.

For existing installations that need to migrate, use the individual
migration scripts in this folder:
  - add_automation_columns.py
  - add_standalone_automations_table.py
  - add_global_module_settings_table.py
  - add_dataset_configs_table.py
  - migrate_to_roles.py

Usage:
    cd backend
    source .venv/bin/activate
    python -m scripts.init_postgres
"""

import os
import sys
import json
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from app.database import engine, Base, SessionLocal
from app.models import (
    User, SavedReport, Scope, ScopeEntitlement, ModuleAccess, 
    GlobalModuleSettings, DatasetConfig, StandaloneAutomation,
    AVAILABLE_MODULES, AVAILABLE_DATASETS
)
from app.auth import get_password_hash
from sqlalchemy import text, inspect


def table_exists(table_name):
    """Check if a table exists in the database."""
    inspector = inspect(engine)
    return table_name in inspector.get_table_names()


def init_database():
    """Main initialization function."""
    
    print("=" * 60)
    print("PostgreSQL Database Initialization")
    print("=" * 60)
    
    # ============== STEP 1: CREATE ALL TABLES ==============
    print("\n1. Creating database tables...")
    Base.metadata.create_all(bind=engine)
    print("   ✓ All tables created (or already exist)")
    
    Session = SessionLocal
    session = Session()
    
    try:
        # ============== STEP 2: SCHEMA MIGRATIONS ==============
        print("\n2. Applying schema migrations...")
        apply_schema_migrations(session)
        
        # ============== STEP 3: CREATE SCOPES ==============
        print("\n3. Creating permission scopes...")
        create_scopes(session)
        
        # ============== STEP 4: CREATE DEMO USERS ==============
        print("\n4. Creating demo users...")
        create_users(session)
        
        # ============== STEP 5: CREATE MODULE ACCESS ==============
        print("\n5. Setting up module access permissions...")
        create_module_access(session)
        
        # ============== STEP 6: SEED DATASET CONFIGS ==============
        print("\n6. Seeding dataset configurations...")
        seed_dataset_configs(session)
        
        session.commit()
        
        # ============== PRINT SUMMARY ==============
        print_summary()
        
    except Exception as e:
        session.rollback()
        print(f"\n✗ Error during initialization: {e}")
        raise
    finally:
        session.close()
    
    print("\n" + "=" * 60)
    print("PostgreSQL initialization complete!")
    print("=" * 60)


def apply_schema_migrations(session):
    """Apply any schema migrations for columns that may not exist."""
    
    migrations = [
        # Users table
        ("users", "scope_id", "INTEGER"),
        ("users", "password_reset_required", "BOOLEAN DEFAULT FALSE"),
        
        # Scopes table  
        ("scopes", "scope_key", "VARCHAR(50)"),
        ("scopes", "role_name", "VARCHAR(100)"),
    ]
    
    for table, column, col_type in migrations:
        try:
            session.execute(text(f"""
                ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {col_type}
            """))
            session.commit()
        except Exception:
            session.rollback()
    
    # Add foreign key for scope_id if not exists
    try:
        session.execute(text("""
            ALTER TABLE users 
            ADD CONSTRAINT IF NOT EXISTS fk_users_scope 
            FOREIGN KEY (scope_id) REFERENCES scopes(id)
        """))
        session.commit()
    except Exception:
        session.rollback()
    
    print("   ✓ Schema migrations applied")


def create_scopes(session):
    """Create default permission scopes."""
    
    scopes_data = [
        {
            "id": 1,
            "name": "Administrator",
            "scope_key": "ADMIN",
            "role_name": "RETAILIQ_ROLE_ADMIN",
            "description": "Full access to all data",
            "is_admin": True,
            "entitlements": [{"tenant_type": "all", "tenant_id": None}]
        },
        {
            "id": 2,
            "name": "Dairy Category Manager",
            "scope_key": "DAIRY_MANAGER",
            "role_name": "RETAILIQ_ROLE_DAIRY_MANAGER",
            "description": "Access to Dairy category data only",
            "is_admin": False,
            "entitlements": [{"tenant_type": "category", "tenant_id": "Dairy"}]
        },
        {
            "id": 3,
            "name": "Kraft Vendor",
            "scope_key": "KRAFT_VENDOR",
            "role_name": "RETAILIQ_ROLE_KRAFT_VENDOR",
            "description": "Access to Kraft brand products only",
            "is_admin": False,
            "entitlements": [{"tenant_type": "brand", "tenant_id": "Kraft"}]
        },
        {
            "id": 4,
            "name": "Beverages & Snacks Team",
            "scope_key": "BEV_SNACKS",
            "role_name": "RETAILIQ_ROLE_BEV_SNACKS",
            "description": "Access to Beverages and Snacks categories",
            "is_admin": False,
            "entitlements": [
                {"tenant_type": "category", "tenant_id": "Beverages"},
                {"tenant_type": "category", "tenant_id": "Snacks"}
            ]
        },
        {
            "id": 5,
            "name": "Produce Manager",
            "scope_key": "PRODUCE_MANAGER",
            "role_name": "RETAILIQ_ROLE_PRODUCE_MANAGER",
            "description": "Access to Produce category data",
            "is_admin": False,
            "entitlements": [{"tenant_type": "category", "tenant_id": "Produce"}]
        },
        {
            "id": 6,
            "name": "Coca-Cola Vendor",
            "scope_key": "COCACOLA_VENDOR",
            "role_name": "RETAILIQ_ROLE_COCACOLA_VENDOR",
            "description": "Access to Coca-Cola brand products",
            "is_admin": False,
            "entitlements": [{"tenant_type": "brand", "tenant_id": "Coca-Cola"}]
        },
    ]
    
    for scope_data in scopes_data:
        existing = session.query(Scope).filter(Scope.id == scope_data["id"]).first()
        
        if not existing:
            scope = Scope(
                id=scope_data["id"],
                name=scope_data["name"],
                scope_key=scope_data["scope_key"],
                role_name=scope_data["role_name"],
                description=scope_data["description"],
                is_admin=scope_data["is_admin"]
            )
            session.add(scope)
            session.flush()
            
            for ent in scope_data["entitlements"]:
                session.add(ScopeEntitlement(
                    scope_id=scope_data["id"],
                    tenant_type=ent["tenant_type"],
                    tenant_id=ent["tenant_id"]
                ))
            
            print(f"   ✓ Created scope: {scope_data['name']}")
        else:
            # Update keys if missing
            if not existing.scope_key:
                existing.scope_key = scope_data["scope_key"]
            if not existing.role_name:
                existing.role_name = scope_data["role_name"]
            print(f"   - Scope exists: {scope_data['name']}")
    
    session.commit()


def create_users(session):
    """Create demo users."""
    
    users_data = [
        {
            "email": "admin@retailiq.com",
            "password": "admin123",
            "full_name": "Admin User",
            "company": "RetailIQ",
            "role": "admin",
            "scope_id": 1
        },
        {
            "email": "demo@retailiq.com",
            "password": "demo123",
            "full_name": "Demo User",
            "company": "RetailIQ Demo",
            "role": "analyst",
            "scope_id": 1
        },
        {
            "email": "dairy_manager@retailiq.com",
            "password": "dairy123",
            "full_name": "Dairy Manager",
            "company": "RetailIQ",
            "role": "analyst",
            "scope_id": 2
        },
        {
            "email": "kraft_vendor@retailiq.com",
            "password": "kraft123",
            "full_name": "Kraft Vendor Rep",
            "company": "Kraft Heinz",
            "role": "analyst",
            "scope_id": 3
        },
    ]
    
    for user_data in users_data:
        existing = session.query(User).filter(User.email == user_data["email"]).first()
        
        if not existing:
            user = User(
                email=user_data["email"],
                hashed_password=get_password_hash(user_data["password"]),
                full_name=user_data["full_name"],
                company=user_data["company"],
                role=user_data["role"],
                scope_id=user_data["scope_id"]
            )
            session.add(user)
            print(f"   ✓ Created user: {user_data['email']}")
        else:
            if existing.scope_id != user_data["scope_id"]:
                existing.scope_id = user_data["scope_id"]
            print(f"   - User exists: {user_data['email']}")
    
    session.commit()


def create_module_access(session):
    """Set up module access permissions for all users."""
    
    all_users = session.query(User).all()
    
    for user in all_users:
        existing_access = session.query(ModuleAccess).filter(
            ModuleAccess.user_id == user.id
        ).first()
        
        if not existing_access:
            is_admin_user = user.role == "admin" or user.email in ["admin@retailiq.com", "demo@retailiq.com"]
            
            for module in AVAILABLE_MODULES:
                if is_admin_user:
                    has_access = True
                else:
                    # Non-admin users get access to core analytics modules only
                    core_modules = [
                        "dashboard",
                        "insights.sales_analytics",
                        "insights.market_basket",
                        "insights.store_performance",
                    ]
                    has_access = module["key"] in core_modules
                
                session.add(ModuleAccess(
                    user_id=user.id,
                    module_key=module["key"],
                    has_access=has_access
                ))
            
            print(f"   ✓ Created module access for {user.email}")
        else:
            print(f"   - Module access exists for {user.email}")
    
    session.commit()


def seed_dataset_configs(session):
    """Seed default dataset configurations."""
    
    # Core datasets that should be marked as connected
    core_datasets = {"transactions", "products", "shoppers", "stores"}
    
    # Default config templates
    templates = {
        "transactions": {
            "type": "snowflake",
            "database": "${SNOWFLAKE_DATABASE}",
            "schema": "${SNOWFLAKE_SCHEMA}",
            "table": "transactions",
            "date_column": "transaction_date",
            "notes": "Transaction-level sales data"
        },
        "products": {
            "type": "snowflake",
            "database": "${SNOWFLAKE_DATABASE}",
            "schema": "${SNOWFLAKE_SCHEMA}",
            "table": "products",
            "key_column": "upc",
            "notes": "Product master data"
        },
        "shoppers": {
            "type": "snowflake",
            "database": "${SNOWFLAKE_DATABASE}",
            "schema": "${SNOWFLAKE_SCHEMA}",
            "table": "shoppers",
            "key_column": "shopper_id",
            "notes": "Customer/shopper profiles"
        },
        "stores": {
            "type": "snowflake",
            "database": "${SNOWFLAKE_DATABASE}",
            "schema": "${SNOWFLAKE_SCHEMA}",
            "table": "stores",
            "key_column": "store_id",
            "notes": "Store locations and attributes"
        },
        "inventory": {
            "type": "snowflake",
            "database": "${SNOWFLAKE_DATABASE}",
            "schema": "${SNOWFLAKE_SCHEMA}",
            "table": "inventory",
            "notes": "Stock levels - configure table name"
        },
        "fulfillment": {
            "type": "snowflake",
            "database": "${SNOWFLAKE_DATABASE}",
            "schema": "${SNOWFLAKE_SCHEMA}",
            "table": "fulfillment_orders",
            "notes": "Order fulfillment data - configure table name"
        },
        "labor": {
            "type": "snowflake",
            "database": "${SNOWFLAKE_DATABASE}",
            "schema": "${SNOWFLAKE_SCHEMA}",
            "table": "labor_schedule",
            "notes": "Staff scheduling data - configure table name"
        },
        "demand_forecast": {
            "type": "snowflake",
            "database": "${SNOWFLAKE_DATABASE}",
            "schema": "${SNOWFLAKE_SCHEMA}",
            "table": "demand_forecasts",
            "notes": "Demand prediction data - configure table name"
        },
        "weather": {
            "type": "api",
            "provider": "openweathermap",
            "api_key_env": "WEATHER_API_KEY",
            "notes": "Weather API configuration"
        },
        "competitor_pricing": {
            "type": "s3",
            "bucket": "${S3_BUCKET}",
            "prefix": "competitor-pricing/",
            "format": "parquet",
            "notes": "Competitor pricing data from S3"
        },
    }
    
    created = 0
    for dataset in AVAILABLE_DATASETS:
        existing = session.query(DatasetConfig).filter(
            DatasetConfig.dataset_key == dataset["key"]
        ).first()
        
        if not existing:
            is_core = dataset["key"] in core_datasets
            config_template = templates.get(dataset["key"], {
                "type": "snowflake",
                "database": "${SNOWFLAKE_DATABASE}",
                "schema": "${SNOWFLAKE_SCHEMA}",
                "table": dataset["key"],
                "notes": f"Configure connection for {dataset['key']}"
            })
            
            config = DatasetConfig(
                dataset_key=dataset["key"],
                is_connected=is_core,
                config=json.dumps(config_template, indent=2),
                last_verified_at=datetime.now(timezone.utc) if is_core else None,
            )
            session.add(config)
            created += 1
    
    session.commit()
    
    if created > 0:
        print(f"   ✓ Created {created} dataset configurations")
    else:
        print("   - All dataset configurations already exist")


def print_summary():
    """Print login credentials summary."""
    
    print("\n" + "=" * 60)
    print("Demo Login Credentials")
    print("=" * 60)
    print("""
  Admin (Full Access):
    Email: admin@retailiq.com
    Password: admin123

  Demo User (Full Access):
    Email: demo@retailiq.com
    Password: demo123

  Dairy Manager (Dairy Category Only):
    Email: dairy_manager@retailiq.com
    Password: dairy123

  Kraft Vendor (Kraft Brand Only):
    Email: kraft_vendor@retailiq.com
    Password: kraft123
""")


if __name__ == "__main__":
    init_database()
