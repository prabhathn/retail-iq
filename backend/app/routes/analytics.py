from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from sqlalchemy.orm import Session
import time

from ..date_anchor import anchor_sql
from ..database import execute_snowflake_query, get_db
from ..schemas import (
    CategorySalesRequest, 
    MarketBasketRequest, 
    ShopperCohortRequest,
    StorePerformanceRequest,
    AnalyticsResponse,
    FilterOptions
)
from ..auth import get_current_user
from ..models import User
from ..utils import log_report_execution, get_user_role_name, get_cohort_filter_sql
from ..table_config import tables

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/filters", response_model=FilterOptions)
async def get_filter_options(current_user: User = Depends(get_current_user)):
    """Get all available filter options for dropdowns - filtered by user's scope"""
    try:
        role_name = get_user_role_name(current_user)
        
        # Use scope-aware queries so users only see options they have access to
        categories = execute_snowflake_query(
            f"SELECT DISTINCT category FROM {tables.PRODUCTS} ORDER BY category",
            role_name=role_name
        )
        brands = execute_snowflake_query(
            f"SELECT DISTINCT brand FROM {tables.PRODUCTS} ORDER BY brand",
            role_name=role_name
        )
        subcategories = execute_snowflake_query(
            f"SELECT DISTINCT subcategory FROM {tables.PRODUCTS} WHERE subcategory IS NOT NULL ORDER BY subcategory",
            role_name=role_name
        )
        # Stores don't have row policies, so no scope needed
        stores = execute_snowflake_query(f"SELECT store_id, store_name, region FROM {tables.STORES} ORDER BY store_name")
        regions = execute_snowflake_query(f"SELECT DISTINCT region FROM {tables.STORES} ORDER BY region")
        
        return FilterOptions(
            categories=[c["CATEGORY"] for c in categories],
            brands=[b["BRAND"] for b in brands],
            subcategories=[s["SUBCATEGORY"] for s in subcategories],
            stores=[{"id": s["STORE_ID"], "name": s["STORE_NAME"], "region": s["REGION"]} for s in stores],
            regions=[r["REGION"] for r in regions]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching filters: {str(e)}")


@router.get("/products")
async def get_products(
    category: Optional[str] = None,
    brand: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 100,
    current_user: User = Depends(get_current_user)
):
    """Get products with optional filters - filtered by user's scope"""
    query = f"SELECT upc, product_name, brand, category, subcategory, price FROM {tables.PRODUCTS} WHERE 1=1"
    
    if category:
        query += f" AND category = '{category}'"
    if brand:
        query += f" AND brand = '{brand}'"
    if search:
        query += f" AND (LOWER(product_name) LIKE '%{search.lower()}%' OR upc LIKE '%{search}%')"
    
    query += f" ORDER BY product_name LIMIT {limit}"
    
    try:
        role_name = get_user_role_name(current_user)
        results = execute_snowflake_query(query, role_name=role_name)
        return {"products": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching products: {str(e)}")


@router.post("/category-sales", response_model=AnalyticsResponse)
async def get_category_sales(
    request: CategorySalesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get sales data by category, brand, or UPC over time"""
    
    # Get cohort filter if specified
    cohort_info = None
    try:
        cohort_filter, cohort_info = get_cohort_filter_sql(
            request.cohort_id, current_user.id, db, "t.shopper_id"
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    
    # Determine grouping column (cast to DATE since transaction_date may be VARCHAR)
    if request.group_by == "day":
        date_trunc = "t.transaction_date::DATE"
    elif request.group_by == "week":
        date_trunc = "DATE_TRUNC('week', t.transaction_date::DATE)"
    else:
        date_trunc = "DATE_TRUNC('month', t.transaction_date::DATE)"
    
    # Build WHERE conditions
    conditions = [
        f"t.transaction_date >= '{request.start_date}'",
        f"t.transaction_date <= '{request.end_date}'"
    ]
    
    # Add cohort filter if specified
    if cohort_filter:
        conditions.append(cohort_filter)
    
    group_column = "p.category"
    if request.upc:
        conditions.append(f"p.upc = '{request.upc}'")
        group_column = "p.product_name"
    elif request.brand:
        conditions.append(f"p.brand = '{request.brand}'")
        group_column = "p.brand"
    elif request.category:
        conditions.append(f"p.category = '{request.category}'")
        group_column = "p.category"
    
    # Location filters - require joining with stores table
    needs_store_join = request.region or request.store_id
    
    if request.store_id:
        conditions.append(f"t.store_id = '{request.store_id}'")
    
    if request.region:
        conditions.append(f"s.region = '{request.region}'")
    
    where_clause = " AND ".join(conditions)
    
    # Build store join clause if needed
    store_join = f"JOIN {tables.STORES} s ON t.store_id = s.store_id" if needs_store_join else ""
    
    # Main data query
    query = f"""
        SELECT 
            {date_trunc} as period,
            {group_column} as group_name,
            SUM(ti.quantity) as units_sold,
            SUM(ti.quantity * ti.unit_price) as total_sales,
            COUNT(DISTINCT t.transaction_id) as num_transactions,
            COUNT(DISTINCT t.shopper_id) as unique_shoppers
        FROM {tables.TRANSACTIONS} t
        JOIN {tables.TRANSACTION_ITEMS} ti ON t.transaction_id = ti.transaction_id
        JOIN {tables.PRODUCTS} p ON ti.upc = p.upc
        {store_join}
        WHERE {where_clause}
        GROUP BY {date_trunc}, {group_column}
        ORDER BY period
    """
    
    # Control chart statistics query - calculate mean, stddev, UCL, LCL in Snowflake
    stats_query = f"""
        WITH daily_sales AS (
            SELECT 
                {date_trunc} as period,
                SUM(ti.quantity * ti.unit_price) as total_sales
            FROM {tables.TRANSACTIONS} t
            JOIN {tables.TRANSACTION_ITEMS} ti ON t.transaction_id = ti.transaction_id
            JOIN {tables.PRODUCTS} p ON ti.upc = p.upc
            {store_join}
            WHERE {where_clause}
            GROUP BY {date_trunc}
        )
        SELECT 
            AVG(total_sales) as mean_sales,
            STDDEV(total_sales) as stddev_sales,
            AVG(total_sales) + (2 * STDDEV(total_sales)) as ucl,
            GREATEST(0, AVG(total_sales) - (2 * STDDEV(total_sales))) as lcl,
            MIN(total_sales) as min_sales,
            MAX(total_sales) as max_sales,
            COUNT(*) as data_points
        FROM daily_sales
    """
    
    start_time = time.time()
    try:
        role_name = get_user_role_name(current_user)
        results = execute_snowflake_query(query, role_name=role_name)
        stats_results = execute_snowflake_query(stats_query, role_name=role_name)
        execution_time = (time.time() - start_time) * 1000
        
        # Extract control chart statistics
        control_limits = {}
        if stats_results and len(stats_results) > 0:
            stats = stats_results[0]
            control_limits = {
                "mean": float(stats.get("MEAN_SALES") or 0),
                "stddev": float(stats.get("STDDEV_SALES") or 0),
                "ucl": float(stats.get("UCL") or 0),
                "lcl": float(stats.get("LCL") or 0),
                "min": float(stats.get("MIN_SALES") or 0),
                "max": float(stats.get("MAX_SALES") or 0),
                "data_points": int(stats.get("DATA_POINTS") or 0)
            }
        
        # Log the report execution
        log_report_execution(
            db=db,
            user_id=current_user.id,
            report_type="category_sales",
            parameters={
                "category": request.category,
                "brand": request.brand,
                "upc": request.upc,
                "start_date": str(request.start_date),
                "end_date": str(request.end_date),
                "group_by": request.group_by,
                "cohort_id": request.cohort_id,
                "region": request.region,
                "store_id": request.store_id
            },
            row_count=len(results),
            execution_time_ms=execution_time,
            results_summary={
                "total_rows": len(results),
                "date_range": {"start": str(request.start_date), "end": str(request.end_date)},
                "control_limits": control_limits,
                "cohort": cohort_info
            }
        )
        
        return AnalyticsResponse(
            data=results,
            metadata={
                "group_by": request.group_by,
                "date_range": {"start": str(request.start_date), "end": str(request.end_date)},
                "control_limits": control_limits,
                "cohort": cohort_info
            }
        )
    except Exception as e:
        # Log failed execution
        log_report_execution(
            db=db,
            user_id=current_user.id,
            report_type="category_sales",
            parameters={
                "category": request.category,
                "brand": request.brand,
                "upc": request.upc,
                "start_date": str(request.start_date),
                "end_date": str(request.end_date),
                "group_by": request.group_by,
                "cohort_id": request.cohort_id
            },
            status="error",
            error_message=str(e)
        )
        raise HTTPException(status_code=500, detail=f"Error running analysis: {str(e)}")


@router.post("/market-basket", response_model=AnalyticsResponse)
async def get_market_basket(
    request: MarketBasketRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Find products frequently purchased with the specified product"""
    
    # Get cohort filter if specified
    cohort_info = None
    try:
        cohort_filter, cohort_info = get_cohort_filter_sql(
            request.cohort_id, current_user.id, db, "t.shopper_id"
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    
    # Build additional filter conditions
    cohort_condition = f"AND {cohort_filter}" if cohort_filter else ""
    
    query = f"""
        WITH target_transactions AS (
            SELECT DISTINCT t.transaction_id
            FROM {tables.TRANSACTIONS} t
            JOIN {tables.TRANSACTION_ITEMS} ti ON t.transaction_id = ti.transaction_id
            WHERE ti.upc = '{request.product_upc}'
            AND t.transaction_date >= '{request.start_date}'
            AND t.transaction_date <= '{request.end_date}'
            {cohort_condition}
        ),
        total_target AS (
            SELECT COUNT(*) as cnt FROM target_transactions
        )
        SELECT 
            p.upc,
            p.product_name,
            p.brand,
            p.category,
            COUNT(DISTINCT ti.transaction_id) as co_occurrence_count,
            ROUND(COUNT(DISTINCT ti.transaction_id) * 100.0 / (SELECT cnt FROM total_target), 2) as support_pct
        FROM {tables.TRANSACTION_ITEMS} ti
        JOIN {tables.PRODUCTS} p ON ti.upc = p.upc
        WHERE ti.transaction_id IN (SELECT transaction_id FROM target_transactions)
        AND ti.upc != '{request.product_upc}'
        GROUP BY p.upc, p.product_name, p.brand, p.category
        HAVING COUNT(DISTINCT ti.transaction_id) * 1.0 / (SELECT cnt FROM total_target) >= {request.min_support}
        ORDER BY co_occurrence_count DESC
        LIMIT {request.limit}
    """
    
    start_time = time.time()
    try:
        role_name = get_user_role_name(current_user)
        results = execute_snowflake_query(query, role_name=role_name)
        target_query = f"SELECT product_name, brand, category FROM {tables.PRODUCTS} WHERE upc = '{request.product_upc}'"
        target_info = execute_snowflake_query(target_query, role_name=role_name)
        execution_time = (time.time() - start_time) * 1000
        
        log_report_execution(
            db=db,
            user_id=current_user.id,
            report_type="market_basket",
            parameters={
                "product_upc": request.product_upc,
                "start_date": str(request.start_date),
                "end_date": str(request.end_date),
                "min_support": request.min_support,
                "limit": request.limit,
                "cohort_id": request.cohort_id
            },
            row_count=len(results),
            execution_time_ms=execution_time,
            results_summary={
                "cohort": cohort_info
            }
        )
        
        return AnalyticsResponse(
            data=results,
            metadata={
                "target_product": target_info[0] if target_info else {},
                "target_upc": request.product_upc,
                "cohort": cohort_info
            }
        )
    except Exception as e:
        log_report_execution(
            db=db, user_id=current_user.id, report_type="market_basket",
            parameters={"product_upc": request.product_upc, "cohort_id": request.cohort_id}, 
            status="error", error_message=str(e)
        )
        raise HTTPException(status_code=500, detail=f"Error running market basket analysis: {str(e)}")


@router.post("/shopper-cohorts", response_model=AnalyticsResponse)
async def get_shopper_cohorts(
    request: ShopperCohortRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Segment shoppers into cohorts based on behavior"""
    
    if request.cohort_type == "frequency":
        query = f"""
            WITH shopper_stats AS (
                SELECT 
                    shopper_id,
                    COUNT(DISTINCT transaction_id) as visit_count
                FROM {tables.TRANSACTIONS}
                WHERE transaction_date >= '{request.start_date}'
                AND transaction_date <= '{request.end_date}'
                GROUP BY shopper_id
            ),
            quantiles AS (
                SELECT 
                    shopper_id,
                    visit_count,
                    NTILE({request.num_segments}) OVER (ORDER BY visit_count) as cohort
                FROM shopper_stats
            )
            SELECT 
                cohort as segment,
                CASE cohort
                    WHEN 1 THEN 'Infrequent'
                    WHEN {request.num_segments} THEN 'Very Frequent'
                    ELSE 'Segment ' || cohort
                END as segment_name,
                COUNT(*) as shopper_count,
                ROUND(AVG(visit_count), 1) as avg_visits,
                MIN(visit_count) as min_visits,
                MAX(visit_count) as max_visits
            FROM quantiles
            GROUP BY cohort
            ORDER BY cohort
        """
    elif request.cohort_type == "monetary":
        query = f"""
            WITH shopper_stats AS (
                SELECT 
                    t.shopper_id,
                    SUM(ti.quantity * ti.unit_price) as total_spend
                FROM {tables.TRANSACTIONS} t
                JOIN {tables.TRANSACTION_ITEMS} ti ON t.transaction_id = ti.transaction_id
                WHERE t.transaction_date >= '{request.start_date}'
                AND t.transaction_date <= '{request.end_date}'
                GROUP BY t.shopper_id
            ),
            quantiles AS (
                SELECT 
                    shopper_id,
                    total_spend,
                    NTILE({request.num_segments}) OVER (ORDER BY total_spend) as cohort
                FROM shopper_stats
            )
            SELECT 
                cohort as segment,
                CASE cohort
                    WHEN 1 THEN 'Low Spender'
                    WHEN {request.num_segments} THEN 'High Spender'
                    ELSE 'Segment ' || cohort
                END as segment_name,
                COUNT(*) as shopper_count,
                ROUND(AVG(total_spend), 2) as avg_spend,
                ROUND(MIN(total_spend), 2) as min_spend,
                ROUND(MAX(total_spend), 2) as max_spend
            FROM quantiles
            GROUP BY cohort
            ORDER BY cohort
        """
    elif request.cohort_type == "recency":
        query = f"""
            WITH shopper_stats AS (
                SELECT 
                    shopper_id,
                    MAX(transaction_date) as last_visit,
                    DATEDIFF('day', MAX(transaction_date), {anchor_sql()}) as days_since_visit
                FROM {tables.TRANSACTIONS}
                WHERE transaction_date >= '{request.start_date}'
                AND transaction_date <= '{request.end_date}'
                GROUP BY shopper_id
            ),
            quantiles AS (
                SELECT 
                    shopper_id,
                    days_since_visit,
                    NTILE({request.num_segments}) OVER (ORDER BY days_since_visit DESC) as cohort
                FROM shopper_stats
            )
            SELECT 
                cohort as segment,
                CASE cohort
                    WHEN 1 THEN 'Churned'
                    WHEN {request.num_segments} THEN 'Recent'
                    ELSE 'Segment ' || cohort
                END as segment_name,
                COUNT(*) as shopper_count,
                ROUND(AVG(days_since_visit), 0) as avg_days_since_visit,
                MIN(days_since_visit) as min_days,
                MAX(days_since_visit) as max_days
            FROM quantiles
            GROUP BY cohort
            ORDER BY cohort
        """
    else:  # category_affinity
        query = f"""
            WITH shopper_category AS (
                SELECT 
                    t.shopper_id,
                    p.category,
                    SUM(ti.quantity * ti.unit_price) as category_spend,
                    ROW_NUMBER() OVER (PARTITION BY t.shopper_id ORDER BY SUM(ti.quantity * ti.unit_price) DESC) as rank
                FROM {tables.TRANSACTIONS} t
                JOIN {tables.TRANSACTION_ITEMS} ti ON t.transaction_id = ti.transaction_id
                JOIN {tables.PRODUCTS} p ON ti.upc = p.upc
                WHERE t.transaction_date >= '{request.start_date}'
                AND t.transaction_date <= '{request.end_date}'
                GROUP BY t.shopper_id, p.category
            )
            SELECT 
                category as segment_name,
                COUNT(*) as shopper_count,
                ROUND(AVG(category_spend), 2) as avg_category_spend
            FROM shopper_category
            WHERE rank = 1
            GROUP BY category
            ORDER BY shopper_count DESC
        """
    
    start_time = time.time()
    try:
        role_name = get_user_role_name(current_user)
        results = execute_snowflake_query(query, role_name=role_name)
        execution_time = (time.time() - start_time) * 1000
        
        log_report_execution(
            db=db, user_id=current_user.id, report_type="shopper_cohorts",
            parameters={
                "cohort_type": request.cohort_type,
                "start_date": str(request.start_date),
                "end_date": str(request.end_date),
                "num_segments": request.num_segments
            },
            row_count=len(results), execution_time_ms=execution_time
        )
        
        return AnalyticsResponse(
            data=results,
            metadata={
                "cohort_type": request.cohort_type,
                "num_segments": request.num_segments
            }
        )
    except Exception as e:
        log_report_execution(
            db=db, user_id=current_user.id, report_type="shopper_cohorts",
            parameters={"cohort_type": request.cohort_type}, status="error", error_message=str(e)
        )
        raise HTTPException(status_code=500, detail=f"Error creating cohorts: {str(e)}")


@router.post("/store-performance", response_model=AnalyticsResponse)
async def get_store_performance(
    request: StorePerformanceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get store performance metrics, optionally filtered by product attributes"""
    
    # Get cohort filter if specified
    cohort_info = None
    try:
        cohort_filter, cohort_info = get_cohort_filter_sql(
            request.cohort_id, current_user.id, db, "t.shopper_id"
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    
    conditions = [
        f"t.transaction_date >= '{request.start_date}'",
        f"t.transaction_date <= '{request.end_date}'"
    ]
    
    # Add cohort filter if specified
    if cohort_filter:
        conditions.append(cohort_filter)
    
    if request.store_ids:
        store_list = "','".join(request.store_ids)
        conditions.append(f"s.store_id IN ('{store_list}')")
    
    if request.region:
        conditions.append(f"s.region = '{request.region}'")
    
    # Product filters - require joining with products table
    needs_product_join = request.upc or request.brand or request.category
    
    if request.upc:
        conditions.append(f"ti.upc = '{request.upc}'")
    
    if request.brand:
        conditions.append(f"p.brand = '{request.brand}'")
    
    if request.category:
        conditions.append(f"p.category = '{request.category}'")
    
    where_clause = " AND ".join(conditions)
    
    if request.metric == "sales":
        metric_select = "SUM(ti.quantity * ti.unit_price)"
        metric_name = "Total Sales"
    elif request.metric == "transactions":
        metric_select = "COUNT(DISTINCT t.transaction_id)"
        metric_name = "Transaction Count"
    else:  # basket_size
        metric_select = "AVG(basket_total)"
        metric_name = "Avg Basket Size"
    
    # Build product join clause if needed
    product_join = f"JOIN {tables.PRODUCTS} p ON ti.upc = p.upc" if needs_product_join else ""
    
    if request.metric == "basket_size":
        # For basket_size with product filters, we need to filter the basket_totals CTE
        basket_where = where_clause.replace('s.store_id', 't.store_id').replace('s.region', '1=1')
        
        query = f"""
            WITH basket_totals AS (
                SELECT 
                    t.transaction_id,
                    t.store_id,
                    SUM(ti.quantity * ti.unit_price) as basket_total
                FROM {tables.TRANSACTIONS} t
                JOIN {tables.TRANSACTION_ITEMS} ti ON t.transaction_id = ti.transaction_id
                {product_join}
                WHERE {basket_where}
                GROUP BY t.transaction_id, t.store_id
            )
            SELECT 
                s.store_id,
                s.store_name,
                s.region,
                ROUND({metric_select}, 2) as metric_value
            FROM basket_totals bt
            JOIN {tables.STORES} s ON bt.store_id = s.store_id
            {'WHERE s.region = ' + chr(39) + request.region + chr(39) if request.region else ''}
            GROUP BY s.store_id, s.store_name, s.region
            ORDER BY metric_value DESC
        """
    else:
        query = f"""
            SELECT 
                s.store_id,
                s.store_name,
                s.region,
                ROUND({metric_select}, 2) as metric_value
            FROM {tables.TRANSACTIONS} t
            JOIN {tables.TRANSACTION_ITEMS} ti ON t.transaction_id = ti.transaction_id
            {product_join}
            JOIN {tables.STORES} s ON t.store_id = s.store_id
            WHERE {where_clause}
            GROUP BY s.store_id, s.store_name, s.region
            ORDER BY metric_value DESC
        """
    
    start_time = time.time()
    try:
        role_name = get_user_role_name(current_user)
        results = execute_snowflake_query(query, role_name=role_name)
        execution_time = (time.time() - start_time) * 1000
        
        log_report_execution(
            db=db, user_id=current_user.id, report_type="store_performance",
            parameters={
                "store_ids": request.store_ids,
                "region": request.region,
                "start_date": str(request.start_date),
                "end_date": str(request.end_date),
                "metric": request.metric,
                "cohort_id": request.cohort_id,
                "upc": request.upc,
                "brand": request.brand,
                "category": request.category
            },
            row_count=len(results), execution_time_ms=execution_time,
            results_summary={"cohort": cohort_info}
        )
        
        return AnalyticsResponse(
            data=results,
            metadata={
                "metric": request.metric,
                "metric_name": metric_name,
                "cohort": cohort_info
            }
        )
    except Exception as e:
        log_report_execution(
            db=db, user_id=current_user.id, report_type="store_performance",
            parameters={"metric": request.metric, "cohort_id": request.cohort_id}, 
            status="error", error_message=str(e)
        )
        raise HTTPException(status_code=500, detail=f"Error fetching store performance: {str(e)}")


@router.get("/dashboard-summary")
async def get_dashboard_summary(current_user: User = Depends(get_current_user)):
    """Get summary statistics for dashboard - last 30 days"""
    try:
        stats_query = f"""
            SELECT 
                COUNT(DISTINCT t.transaction_id) as total_transactions,
                COUNT(DISTINCT t.shopper_id) as total_shoppers,
                ROUND(SUM(ti.quantity * ti.unit_price), 2) as total_sales,
                ROUND(AVG(basket_total), 2) as avg_basket_size
            FROM {tables.TRANSACTIONS} t
            JOIN {tables.TRANSACTION_ITEMS} ti ON t.transaction_id = ti.transaction_id
            JOIN (
                SELECT transaction_id, SUM(quantity * unit_price) as basket_total
                FROM {tables.TRANSACTION_ITEMS}
                GROUP BY transaction_id
            ) bt ON t.transaction_id = bt.transaction_id
            WHERE t.transaction_date >= {anchor_sql()} - 30
        """
        
        role_name = get_user_role_name(current_user)
        stats = execute_snowflake_query(stats_query, role_name=role_name)
        
        return {
            "summary": stats[0] if stats else {}
        }
    except Exception as e:
        import traceback
        print(f"[ERROR] Dashboard summary error: {type(e).__name__}: {e}")
        print(f"[ERROR] Full traceback:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error fetching dashboard summary: {str(e)}")


@router.get("/top-performers")
async def get_top_performers(
    dimension: str = "category",
    limit: int = 5,
    current_user: User = Depends(get_current_user)
):
    """Get top performers by dimension (category, brand, product, store) - last 30 days"""
    try:
        if dimension == "category":
            query = f"""
                SELECT 
                    p.category as name,
                    ROUND(SUM(ti.quantity * ti.unit_price), 2) as sales,
                    SUM(ti.quantity) as units
                FROM {tables.TRANSACTIONS} t
                JOIN {tables.TRANSACTION_ITEMS} ti ON t.transaction_id = ti.transaction_id
                JOIN {tables.PRODUCTS} p ON ti.upc = p.upc
                WHERE t.transaction_date >= {anchor_sql()} - 30
                GROUP BY p.category
                ORDER BY sales DESC
                LIMIT {limit}
            """
        elif dimension == "brand":
            query = f"""
                SELECT 
                    p.brand as name,
                    ROUND(SUM(ti.quantity * ti.unit_price), 2) as sales,
                    SUM(ti.quantity) as units
                FROM {tables.TRANSACTIONS} t
                JOIN {tables.TRANSACTION_ITEMS} ti ON t.transaction_id = ti.transaction_id
                JOIN {tables.PRODUCTS} p ON ti.upc = p.upc
                WHERE t.transaction_date >= {anchor_sql()} - 30
                GROUP BY p.brand
                ORDER BY sales DESC
                LIMIT {limit}
            """
        elif dimension == "product":
            query = f"""
                SELECT 
                    p.product_name as name,
                    ROUND(SUM(ti.quantity * ti.unit_price), 2) as sales,
                    SUM(ti.quantity) as units
                FROM {tables.TRANSACTIONS} t
                JOIN {tables.TRANSACTION_ITEMS} ti ON t.transaction_id = ti.transaction_id
                JOIN {tables.PRODUCTS} p ON ti.upc = p.upc
                WHERE t.transaction_date >= {anchor_sql()} - 30
                GROUP BY p.product_name
                ORDER BY sales DESC
                LIMIT {limit}
            """
        elif dimension == "store":
            query = f"""
                SELECT 
                    s.store_name as name,
                    ROUND(SUM(ti.quantity * ti.unit_price), 2) as sales,
                    COUNT(DISTINCT t.transaction_id) as transactions
                FROM {tables.TRANSACTIONS} t
                JOIN {tables.TRANSACTION_ITEMS} ti ON t.transaction_id = ti.transaction_id
                JOIN {tables.STORES} s ON t.store_id = s.store_id
                WHERE t.transaction_date >= {anchor_sql()} - 30
                GROUP BY s.store_name
                ORDER BY sales DESC
                LIMIT {limit}
            """
        else:
            raise HTTPException(status_code=400, detail=f"Invalid dimension: {dimension}")
        
        role_name = get_user_role_name(current_user)
        results = execute_snowflake_query(query, role_name=role_name)
        
        return {
            "dimension": dimension,
            "data": results
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"[ERROR] Top performers error: {type(e).__name__}: {e}")
        print(f"[ERROR] Full traceback:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error fetching top performers: {str(e)}")
