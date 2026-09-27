"""
SQL Query Builder functions for reusable query patterns.
Centralizes common SQL patterns used across analytics and cohorts.

Usage:
    from .query_builders import (
        transaction_product_from,
        seed_cohort_cte,
        build_segment_query,
        build_condition_subquery
    )
"""
from typing import List, Optional, Dict, Any
from .table_config import tables
from .date_anchor import anchor_sql


# =============================================================================
# Common Join Patterns
# =============================================================================

def transaction_product_from(txn_alias: str = "t", item_alias: str = "ti", product_alias: str = "p") -> str:
    """
    Standard 3-way FROM clause for transaction analysis.
    
    Returns:
        FROM transactions t
        JOIN transaction_items ti ON t.transaction_id = ti.transaction_id
        JOIN products p ON ti.upc = p.upc
    """
    return f"""
        {tables.TRANSACTIONS} {txn_alias}
        JOIN {tables.TRANSACTION_ITEMS} {item_alias} 
            ON {txn_alias}.transaction_id = {item_alias}.transaction_id
        JOIN {tables.PRODUCTS} {product_alias} 
            ON {item_alias}.upc = {product_alias}.upc
    """.strip()


def transaction_items_join(item_alias: str = "ti", txn_alias: str = "t") -> str:
    """Join from transactions to transaction_items."""
    return f"JOIN {tables.TRANSACTION_ITEMS} {item_alias} ON {txn_alias}.transaction_id = {item_alias}.transaction_id"


def products_join(product_alias: str = "p", item_alias: str = "ti") -> str:
    """Join from transaction_items to products."""
    return f"JOIN {tables.PRODUCTS} {product_alias} ON {item_alias}.upc = {product_alias}.upc"


def stores_join(store_alias: str = "st", txn_alias: str = "t") -> str:
    """Join from transactions to stores."""
    return f"JOIN {tables.STORES} {store_alias} ON {txn_alias}.store_id = {store_alias}.store_id"


# =============================================================================
# Cohort Member Queries
# =============================================================================

def seed_cohort_cte(user_id: int, cohort_id: int, cte_name: str = "seed_shoppers") -> str:
    """
    CTE to get shopper IDs from a cohort.
    
    Example output:
        seed_shoppers AS (
            SELECT shopper_id FROM cohort_members 
            WHERE user_id = 1 AND cohort_id = 5
        )
    """
    return f"""
        {cte_name} AS (
            SELECT shopper_id 
            FROM {tables.COHORT_MEMBERS} 
            WHERE user_id = {user_id} AND cohort_id = {cohort_id}
        )
    """.strip()


def seed_cohort_query(user_id: int, cohort_id: int) -> str:
    """Simple query to get shopper IDs from a cohort (not as CTE)."""
    return f"""
        SELECT shopper_id 
        FROM {tables.COHORT_MEMBERS} 
        WHERE user_id = {user_id} AND cohort_id = {cohort_id}
    """.strip()


def cohort_exclusion_join(seed_alias: str = "ss", txn_alias: str = "t") -> str:
    """LEFT JOIN pattern to exclude seed cohort members."""
    return f"""
        LEFT JOIN seed_shoppers {seed_alias} 
            ON {txn_alias}.shopper_id = {seed_alias}.shopper_id
    """.strip()


def delete_cohort_members_sql(user_id: int, cohort_id: int) -> str:
    """SQL to delete existing cohort members before re-inserting."""
    return f"DELETE FROM {tables.COHORT_MEMBERS} WHERE user_id = {user_id} AND cohort_id = {cohort_id}"


def insert_cohort_members_sql(user_id: int, cohort_id: int, shopper_ids: List[str]) -> str:
    """SQL to insert cohort members."""
    values = ", ".join([f"({user_id}, {cohort_id}, '{sid}')" for sid in shopper_ids])
    return f"INSERT INTO {tables.COHORT_MEMBERS} (user_id, cohort_id, shopper_id) VALUES {values}"


# =============================================================================
# Segment Query Builder
# =============================================================================

def build_segment_query(
    segment_type: str,
    start_date: str,
    end_date: str,
    criteria: Dict[str, Any]
) -> str:
    """
    Build segment-specific shopper queries.
    
    Args:
        segment_type: One of 'frequency', 'monetary', 'recency', 'category_affinity'
        start_date: Start date string (YYYY-MM-DD)
        end_date: End date string (YYYY-MM-DD)
        criteria: Dict with segment-specific criteria (min_visits, max_visits, etc.)
    
    Returns:
        SQL query string that selects shopper_ids matching the criteria
    """
    date_filter = f"transaction_date >= '{start_date}' AND transaction_date <= '{end_date}'"
    
    if segment_type == "frequency":
        return f"""
            WITH shopper_stats AS (
                SELECT 
                    shopper_id,
                    COUNT(DISTINCT transaction_id) as visit_count
                FROM {tables.TRANSACTIONS}
                WHERE {date_filter}
                GROUP BY shopper_id
            )
            SELECT shopper_id FROM shopper_stats
            WHERE visit_count >= {criteria.get('min_visits', 0)}
            AND visit_count <= {criteria.get('max_visits', 999999)}
        """
    
    elif segment_type == "monetary":
        return f"""
            WITH shopper_stats AS (
                SELECT 
                    t.shopper_id,
                    SUM(ti.quantity * ti.unit_price) as total_spend
                FROM {tables.TRANSACTIONS} t
                JOIN {tables.TRANSACTION_ITEMS} ti ON t.transaction_id = ti.transaction_id
                WHERE t.{date_filter}
                GROUP BY t.shopper_id
            )
            SELECT shopper_id FROM shopper_stats
            WHERE total_spend >= {criteria.get('min_spend', 0)}
            AND total_spend <= {criteria.get('max_spend', 999999999)}
        """
    
    elif segment_type == "recency":
        return f"""
            WITH shopper_stats AS (
                SELECT 
                    shopper_id,
                    DATEDIFF('day', MAX(transaction_date), {anchor_sql()}) as days_since_visit
                FROM {tables.TRANSACTIONS}
                WHERE {date_filter}
                GROUP BY shopper_id
            )
            SELECT shopper_id FROM shopper_stats
            WHERE days_since_visit >= {criteria.get('min_days', 0)}
            AND days_since_visit <= {criteria.get('max_days', 999999)}
        """
    
    elif segment_type == "category_affinity":
        return f"""
            WITH shopper_category AS (
                SELECT 
                    t.shopper_id,
                    p.category,
                    SUM(ti.quantity * ti.unit_price) as category_spend,
                    ROW_NUMBER() OVER (PARTITION BY t.shopper_id ORDER BY SUM(ti.quantity * ti.unit_price) DESC) as rank
                FROM {tables.TRANSACTIONS} t
                JOIN {tables.TRANSACTION_ITEMS} ti ON t.transaction_id = ti.transaction_id
                JOIN {tables.PRODUCTS} p ON ti.upc = p.upc
                WHERE t.{date_filter}
                GROUP BY t.shopper_id, p.category
            )
            SELECT shopper_id FROM shopper_category
            WHERE rank = 1 AND category = '{criteria.get('category', '')}'
        """
    
    else:
        raise ValueError(f"Unknown segment type: {segment_type}")


# =============================================================================
# Cohort Condition Query Builder
# =============================================================================

def build_condition_subquery(
    field: str,
    operator: str,
    value: str,
    days: int = 30,
    frequency: Optional[int] = None,
    amount: Optional[float] = None,
    alias_suffix: str = "2"
) -> str:
    """
    Build a single condition subquery for cohort definition.
    
    Args:
        field: 'brand' or 'category'
        operator: 'bought', 'bought_times', or 'spent_more_than'
        value: The brand name, category, etc.
        days: Time window in days
        frequency: Required for 'bought_times' operator
        amount: Required for 'spent_more_than' operator
        alias_suffix: Suffix for table aliases to avoid conflicts
    
    Returns:
        SQL subquery that selects shopper_ids matching the condition
    """
    t = f"t{alias_suffix}"
    ti = f"ti{alias_suffix}"
    p = f"p{alias_suffix}"
    
    field_col = f"{p}.brand" if field == "brand" else f"{p}.category"
    
    base_from = f"""
        FROM {tables.TRANSACTIONS} {t}
        JOIN {tables.TRANSACTION_ITEMS} {ti} ON {t}.transaction_id = {ti}.transaction_id
        JOIN {tables.PRODUCTS} {p} ON {ti}.upc = {p}.upc
        WHERE {field_col} = '{value}'
        AND {t}.transaction_date >= {anchor_sql()} - {days}
    """
    
    if operator == 'bought':
        return f"SELECT DISTINCT {t}.shopper_id {base_from}"
    
    elif operator == 'bought_times':
        return f"""
            SELECT {t}.shopper_id {base_from}
            GROUP BY {t}.shopper_id
            HAVING COUNT(DISTINCT {t}.transaction_id) >= {frequency}
        """
    
    elif operator == 'spent_more_than':
        return f"""
            SELECT {t}.shopper_id {base_from}
            GROUP BY {t}.shopper_id
            HAVING SUM({ti}.quantity * {ti}.unit_price) >= {amount}
        """
    
    else:
        raise ValueError(f"Unknown operator: {operator}")


def build_cohort_query(conditions: list, condition_logic: str = "AND") -> str:
    """
    Build SQL query from cohort conditions.
    
    Args:
        conditions: List of condition dicts with field, operator, value, etc.
        condition_logic: 'AND' or 'OR' to combine conditions
    
    Returns:
        Complete SQL query that selects distinct shopper_ids matching all/any conditions
    """
    where_clauses = []
    
    for i, cond in enumerate(conditions):
        # Handle both dict and object conditions
        if hasattr(cond, 'field'):
            field = cond.field
            operator = cond.operator
            value = cond.value
            days = getattr(cond, 'days', 30)
            frequency = getattr(cond, 'frequency', None)
            amount = getattr(cond, 'amount', None)
        else:
            field = cond.get('field')
            operator = cond.get('operator')
            value = cond.get('value')
            days = cond.get('days', 30)
            frequency = cond.get('frequency')
            amount = cond.get('amount')
        
        subquery = build_condition_subquery(
            field=field,
            operator=operator,
            value=value,
            days=days,
            frequency=frequency,
            amount=amount,
            alias_suffix=str(i + 2)
        )
        
        where_clauses.append(f"(t.shopper_id IN ({subquery}))")
    
    logic_operator = " AND " if condition_logic == "AND" else " OR "
    combined_where = logic_operator.join(where_clauses)
    
    return f"""
        SELECT DISTINCT t.shopper_id
        FROM {tables.TRANSACTIONS} t
        WHERE {combined_where}
    """


# =============================================================================
# Table Management Queries
# =============================================================================

def create_cohort_members_table_sql() -> str:
    """SQL to create the cohort_members table if it doesn't exist."""
    return f"""
        CREATE TABLE IF NOT EXISTS {tables.COHORT_MEMBERS} (
            user_id INTEGER NOT NULL,
            cohort_id INTEGER NOT NULL,
            shopper_id VARCHAR(50) NOT NULL,
            created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
            PRIMARY KEY (user_id, cohort_id, shopper_id)
        )
    """

