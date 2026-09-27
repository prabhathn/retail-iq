"""
Table name configuration for multi-tenant support.
Allows customers to map their existing table names to the application's expected schema.

Usage:
    from .table_config import tables
    
    query = f"SELECT * FROM {tables.TRANSACTIONS} t JOIN {tables.PRODUCTS} p ON ..."

Environment Variables:
    TABLE_TRANSACTIONS - Default: "transactions"
    TABLE_TRANSACTION_ITEMS - Default: "transaction_items"
    TABLE_PRODUCTS - Default: "products"
    TABLE_STORES - Default: "stores"
    TABLE_DAILY_SALES - Default: "daily_sales"
    TABLE_COHORT_MEMBERS - Default: "cohort_members"
"""
import os
from typing import Dict


class TableConfig:
    """
    Centralized table name mappings.
    Override via environment variables for customer-specific schemas.
    
    Example customer configuration:
        TABLE_TRANSACTIONS=dwh.fact_pos_transactions
        TABLE_PRODUCTS=dwh.dim_product
        TABLE_STORES=dwh.dim_store_location
    """
    
    # Core fact tables
    TRANSACTIONS: str = os.getenv("TABLE_TRANSACTIONS", "transactions")
    TRANSACTION_ITEMS: str = os.getenv("TABLE_TRANSACTION_ITEMS", "transaction_items")
    
    # Dimension tables
    PRODUCTS: str = os.getenv("TABLE_PRODUCTS", "products")
    STORES: str = os.getenv("TABLE_STORES", "stores")
    
    # Aggregated tables (optional - some customers may not have these)
    DAILY_SALES: str = os.getenv("TABLE_DAILY_SALES", "daily_sales")
    
    # Application tables (in Snowflake for cohorts)
    COHORT_MEMBERS: str = os.getenv("TABLE_COHORT_MEMBERS", "cohort_members")
    
    @classmethod
    def get_all(cls) -> Dict[str, str]:
        """Return all table mappings for debugging/admin."""
        return {
            "transactions": cls.TRANSACTIONS,
            "transaction_items": cls.TRANSACTION_ITEMS,
            "products": cls.PRODUCTS,
            "stores": cls.STORES,
            "daily_sales": cls.DAILY_SALES,
            "cohort_members": cls.COHORT_MEMBERS,
        }


# Singleton instance for easy imports
tables = TableConfig()

