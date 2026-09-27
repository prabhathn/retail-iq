"""
Database connections for PostgreSQL (app data) and Snowflake (analytics data).
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from contextlib import contextmanager
from typing import Optional, List, Dict, Any
from datetime import datetime
import time
import snowflake.connector
from .config import settings

# PostgreSQL connection for app data
engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def _timestamp():
    """Get current timestamp for logging."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]


def _log(message: str):
    """Print a timestamped log message."""
    print(f"[{_timestamp()}] {message}")


def get_db():
    """Dependency for FastAPI routes to get a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_snowflake_connection(role_name: Optional[str] = None):
    """Create and return a Snowflake connection for analytics queries.
    
    The connection is configured with default warehouse, database, schema,
    and optionally a role for row-level access control.
    
    Args:
        role_name: Optional Snowflake role name (e.g., 'RETAILIQ_ROLE_ADMIN', 'RETAILIQ_ROLE_DAIRY_MANAGER')
                   If provided, the connection will use this role for RBAC filtering.
    """
    role_info = f" with role={role_name}" if role_name else ""
    _log(f"SNOWFLAKE: Connecting{role_info}...")
    start = time.time()
    
    connect_params = {
        "account": settings.SNOWFLAKE_ACCOUNT,
        "user": settings.SNOWFLAKE_USER,
        "password": settings.SNOWFLAKE_PASSWORD,
        "warehouse": settings.SNOWFLAKE_WAREHOUSE,
        "database": settings.SNOWFLAKE_DATABASE,
        "schema": settings.SNOWFLAKE_SCHEMA,
        "insecure_mode": True,  # Skip OCSP certificate check
    }
    
    # Set role at connection time if provided
    if role_name:
        connect_params["role"] = role_name
    
    try:
        conn = snowflake.connector.connect(**connect_params)
        elapsed = (time.time() - start) * 1000
        _log(f"SNOWFLAKE: Connected ({elapsed:.0f}ms){role_info}")
        return conn
    except Exception as e:
        elapsed = (time.time() - start) * 1000
        _log(f"SNOWFLAKE CONNECTION ERROR ({elapsed:.0f}ms): {str(e)}")
        _log(f"SNOWFLAKE CONNECTION ERROR: Role requested: {role_name}")
        _log(f"SNOWFLAKE CONNECTION ERROR: Account: {settings.SNOWFLAKE_ACCOUNT}")
        _log(f"SNOWFLAKE CONNECTION ERROR: User: {settings.SNOWFLAKE_USER}")
        raise


def execute_snowflake_query(
    query: str, 
    role_name: Optional[str] = None, 
    params: dict = None
) -> List[Dict[str, Any]]:
    """Execute a query on Snowflake and return results as list of dicts.
    
    The warehouse, database, schema, and role are all configured at connection time,
    so no additional session setup is needed.
    
    Args:
        query: SQL query to execute
        role_name: Optional Snowflake role name (e.g., 'RETAILIQ_ROLE_ADMIN', 'RETAILIQ_ROLE_DAIRY_MANAGER') 
                   for row-level filtering via Row Access Policies that check CURRENT_ROLE().
                   If None, uses the default role from connection.
        params: Optional query parameters for parameterized queries
        
    Returns:
        List of dicts with query results, column names as keys
        
    Raises:
        Exception: On Snowflake query errors (logged before re-raising)
    """
    # Truncate query for logging (first 100 chars)
    query_preview = query.replace('\n', ' ').strip()[:100]
    if len(query.strip()) > 100:
        query_preview += "..."
    
    total_start = time.time()
    # Role is set at connection time - no need for USE ROLE command
    conn = get_snowflake_connection(role_name=role_name)
    cursor = None
    
    try:
        cursor = conn.cursor()
        
        _log(f"SNOWFLAKE: Executing query: {query_preview}")
        query_start = time.time()
        
        if params:
            cursor.execute(query, params)
        else:
            cursor.execute(query)
        
        query_elapsed = (time.time() - query_start) * 1000
        _log(f"SNOWFLAKE: Query executed ({query_elapsed:.0f}ms)")
        
        fetch_start = time.time()
        columns = [desc[0] for desc in cursor.description] if cursor.description else []
        results = cursor.fetchall()
        fetch_elapsed = (time.time() - fetch_start) * 1000
        
        row_count = len(results)
        _log(f"SNOWFLAKE: Fetched {row_count} rows ({fetch_elapsed:.0f}ms)")
        
        total_elapsed = (time.time() - total_start) * 1000
        _log(f"SNOWFLAKE: Total time: {total_elapsed:.0f}ms (connect + query + fetch)")
        
        return [dict(zip(columns, row)) for row in results]
    except Exception as e:
        import traceback
        _log(f"SNOWFLAKE ERROR: {type(e).__name__}: {e}")
        _log(f"SNOWFLAKE ERROR: Query was: {query}")
        if role_name:
            _log(f"SNOWFLAKE ERROR: Role: {role_name}")
        _log(f"SNOWFLAKE ERROR: Full traceback:\n{traceback.format_exc()}")
        raise
    finally:
        if conn:
            conn.close()
            _log("SNOWFLAKE: Connection closed")


@contextmanager
def snowflake_cursor(role_name: Optional[str] = None):
    """Context manager for Snowflake cursor with automatic cleanup.
    
    Use this when you need direct cursor access for operations like
    batch inserts or multiple statements. The warehouse, database, schema,
    and role are all configured at connection time.
    
    Args:
        role_name: Optional Snowflake role name for RBAC filtering
        
    Yields:
        tuple: (cursor, connection) for manual operations
        
    Example:
        with snowflake_cursor(role_name='RETAILIQ_ROLE_ADMIN') as (cursor, conn):
            cursor.execute("INSERT INTO ...")
            cursor.execute("INSERT INTO ...")
            conn.commit()
    """
    _log(f"SNOWFLAKE CURSOR: Opening (role={role_name})")
    start = time.time()
    # Role is set at connection time
    conn = get_snowflake_connection(role_name=role_name)
    cursor = conn.cursor()
    try:
        yield cursor, conn
    finally:
        cursor.close()
        conn.close()
        elapsed = (time.time() - start) * 1000
        _log(f"SNOWFLAKE CURSOR: Closed ({elapsed:.0f}ms total)")
