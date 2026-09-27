"""
Shared utility functions for the RetailIQ application.

Consolidates common patterns used across routes:
- Report execution logging
- User scope key retrieval for RBAC
- Cohort filtering for analytics queries
"""

from sqlalchemy.orm import Session
import json
from typing import Optional, Tuple

from .models import User, ReportExecution, ShopperCohort
from .table_config import tables


def get_user_role_name(user: User) -> Optional[str]:
    """Get the Snowflake role name for a user, used for role-based access control.
    
    Returns the role_name string (e.g., 'RETAILIQ_ROLE_ADMIN', 'RETAILIQ_ROLE_DAIRY_MANAGER') that
    corresponds to a Snowflake role. The role is set at connection time, and
    Row Access Policies check CURRENT_ROLE() against the role_entitlements table.
    
    Args:
        user: The User model instance
        
    Returns:
        role_name string or None if user has no scope/role assigned
    """
    if user.scope and user.scope.role_name:
        return user.scope.role_name
    return None  # Will result in no access if RAP is active


# Backwards compatibility alias (deprecated)
def get_user_scope_key(user: User) -> Optional[str]:
    """Deprecated: Use get_user_role_name instead."""
    return get_user_role_name(user)


def log_report_execution(
    db: Session,
    user_id: int,
    report_type: str,
    parameters: dict,
    row_count: int = None,
    execution_time_ms: float = None,
    status: str = "success",
    error_message: str = None,
    results_summary: dict = None,
    report_name: str = None
) -> ReportExecution:
    """Log a report execution to the database.
    
    Creates a ReportExecution record tracking what report was run,
    with what parameters, and optionally the results summary.
    
    Args:
        db: SQLAlchemy database session
        user_id: ID of the user who ran the report
        report_type: Type of report (e.g., 'category_sales', 'market_basket')
        parameters: Dictionary of report parameters
        row_count: Number of rows returned
        execution_time_ms: Query execution time in milliseconds
        status: 'success' or 'error'
        error_message: Error details if status is 'error'
        results_summary: Summary of results for quick reference
        report_name: Optional human-readable report name
        
    Returns:
        The created ReportExecution instance
    """
    log_entry = ReportExecution(
        user_id=user_id,
        report_type=report_type,
        report_name=report_name,
        parameters=json.dumps(parameters),
        results_summary=json.dumps(results_summary) if results_summary else None,
        row_count=row_count,
        execution_time_ms=execution_time_ms,
        status=status,
        error_message=error_message
    )
    db.add(log_entry)
    db.commit()
    return log_entry


def get_cohort_filter_sql(
    cohort_id: Optional[int],
    user_id: int,
    db: Session,
    shopper_id_column: str = "t.shopper_id"
) -> Tuple[str, Optional[dict]]:
    """Build a SQL condition to filter by shoppers in a cohort.
    
    Returns a SQL condition string that can be added to a WHERE clause,
    and cohort metadata for logging.
    
    Args:
        cohort_id: The ID of the cohort to filter by, or None for no filter
        user_id: The ID of the current user (to verify cohort ownership)
        db: SQLAlchemy database session
        shopper_id_column: The column reference for shopper_id (default: 't.shopper_id')
        
    Returns:
        Tuple of (SQL condition string, cohort metadata dict or None)
        
    Raises:
        ValueError: If cohort doesn't exist or user doesn't have access
    """
    if not cohort_id:
        return "", None
    
    # Verify user has access to the cohort
    cohort = db.query(ShopperCohort).filter(
        ShopperCohort.id == cohort_id,
        ShopperCohort.user_id == user_id,
        ShopperCohort.is_active == True
    ).first()
    
    if not cohort:
        raise ValueError(f"Cohort {cohort_id} not found or access denied")
    
    # Build the filter condition using the cohort_members table in Snowflake
    filter_sql = f"""
        {shopper_id_column} IN (
            SELECT shopper_id 
            FROM {tables.COHORT_MEMBERS} 
            WHERE user_id = {user_id} 
            AND cohort_id = {cohort_id}
        )
    """
    
    cohort_info = {
        "cohort_id": cohort.id,
        "cohort_name": cohort.name,
        "shopper_count": cohort.shopper_count
    }
    
    return filter_sql.strip(), cohort_info

