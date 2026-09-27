from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional, List
from pydantic import BaseModel
import json
import time

from ..date_anchor import anchor_sql
from ..database import get_db, execute_snowflake_query, snowflake_cursor
from ..models import User, ShopperCohort
from ..auth import get_current_user
from ..utils import log_report_execution, get_user_role_name
from ..table_config import tables
from ..query_builders import (
    build_cohort_query,
    build_segment_query,
    seed_cohort_query,
    seed_cohort_cte,
    delete_cohort_members_sql,
    insert_cohort_members_sql,
    create_cohort_members_table_sql,
)

router = APIRouter(prefix="/cohorts", tags=["Shopper Cohorts"])


# Pydantic models
class CohortCondition(BaseModel):
    field: str  # 'brand', 'category', 'product', 'store'
    operator: str  # 'bought', 'bought_times', 'spent_more_than'
    value: str  # The brand name, category, UPC, etc.
    frequency: Optional[int] = None  # For 'bought_times' operator
    amount: Optional[float] = None  # For 'spent_more_than' operator
    days: int = 30  # Time window


class CreateCustomCohortRequest(BaseModel):
    name: str
    description: Optional[str] = None
    conditions: List[CohortCondition]
    condition_logic: str = "AND"  # 'AND' or 'OR'


class CreateSegmentCohortRequest(BaseModel):
    name: str
    description: Optional[str] = None
    segment_type: str  # 'frequency', 'monetary', 'recency', 'category_affinity'
    segment_name: str  # The specific segment (e.g., 'High Spender', 'Frequent')
    segment_criteria: dict  # The criteria that defines this segment
    start_date: str
    end_date: str


class PreviewCohortRequest(BaseModel):
    conditions: List[CohortCondition]
    condition_logic: str = "AND"


class LookalikeExpansionRequest(BaseModel):
    seed_cohort_id: int
    expansion_factor: float = 2.0  # Expand to 2x the seed size
    max_audience_size: Optional[int] = 10000  # Max lookalikes to find
    features: List[str] = ["categories", "brands", "frequency", "spend"]  # Features to use for similarity


class SaveLookalikeRequest(BaseModel):
    seed_cohort_id: int
    lookalike_shopper_ids: List[str]
    name: str
    description: Optional[str] = None
    expansion_params: dict  # Store the expansion parameters used


def ensure_cohort_members_table():
    """Create the cohort_members table in Snowflake if it doesn't exist"""
    try:
        execute_snowflake_query(create_cohort_members_table_sql())
    except Exception as e:
        print(f"Error creating cohort_members table: {e}")


def save_cohort_members(user_id: int, cohort_id: int, shopper_ids: List[str]):
    """Save shopper IDs to Snowflake cohort_members table using context manager"""
    with snowflake_cursor() as (cursor, conn):
        # Delete any existing members for this cohort
        cursor.execute(delete_cohort_members_sql(user_id, cohort_id))
        
        # Insert in batches of 1000
        batch_size = 1000
        for i in range(0, len(shopper_ids), batch_size):
            batch = shopper_ids[i:i + batch_size]
            cursor.execute(insert_cohort_members_sql(user_id, cohort_id, batch))
        
        conn.commit()


@router.post("/preview")
async def preview_cohort(
    request: PreviewCohortRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Preview a cohort without saving - returns count and sample shoppers"""
    start_time = time.time()
    try:
        query = build_cohort_query(request.conditions, request.condition_logic)
        role_name = get_user_role_name(current_user)
        
        # Get count
        count_query = f"SELECT COUNT(*) as cnt FROM ({query})"
        count_result = execute_snowflake_query(count_query, role_name=role_name)
        shopper_count = count_result[0]['CNT'] if count_result else 0
        
        # Get sample (first 10)
        sample_query = f"{query} LIMIT 10"
        sample_result = execute_snowflake_query(sample_query, role_name=role_name)
        sample_shoppers = [r['SHOPPER_ID'] for r in sample_result]
        
        execution_time = (time.time() - start_time) * 1000
        
        # Log the report execution
        log_report_execution(
            db=db,
            user_id=current_user.id,
            report_type="cohort_preview",
            parameters={
                "conditions": [c.dict() for c in request.conditions],
                "condition_logic": request.condition_logic
            },
            results_summary={"shopper_count": shopper_count},
            row_count=shopper_count,
            execution_time_ms=execution_time
        )
        
        return {
            "shopper_count": shopper_count,
            "sample_shoppers": sample_shoppers
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error previewing cohort: {str(e)}")


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_custom_cohort(
    request: CreateCustomCohortRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a custom cohort based on conditions and save shopper IDs to Snowflake"""
    start_time = time.time()
    try:
        # Ensure the cohort_members table exists
        ensure_cohort_members_table()
        
        # Build and execute the query with scope filtering
        query = build_cohort_query(request.conditions, request.condition_logic)
        role_name = get_user_role_name(current_user)
        shoppers = execute_snowflake_query(query, role_name=role_name)
        shopper_ids = [r['SHOPPER_ID'] for r in shoppers]
        shopper_count = len(shopper_ids)
        
        if shopper_count == 0:
            raise HTTPException(status_code=400, detail="No shoppers match the defined criteria")
        
        # Create cohort metadata in PostgreSQL
        cohort = ShopperCohort(
            user_id=current_user.id,
            name=request.name,
            description=request.description,
            cohort_type="custom",
            definition=json.dumps({
                "conditions": [c.dict() for c in request.conditions],
                "condition_logic": request.condition_logic
            }),
            shopper_count=shopper_count
        )
        db.add(cohort)
        db.commit()
        db.refresh(cohort)
        
        # Save shopper IDs to Snowflake using helper function
        save_cohort_members(current_user.id, cohort.id, shopper_ids)
        
        execution_time = (time.time() - start_time) * 1000
        
        # Log the report execution
        log_report_execution(
            db=db,
            user_id=current_user.id,
            report_type="cohort_create",
            parameters={
                "name": request.name,
                "conditions": [c.dict() for c in request.conditions],
                "condition_logic": request.condition_logic
            },
            results_summary={"cohort_id": cohort.id, "shopper_count": shopper_count},
            row_count=shopper_count,
            execution_time_ms=execution_time
        )
        
        return {
            "id": cohort.id,
            "name": cohort.name,
            "description": cohort.description,
            "cohort_type": cohort.cohort_type,
            "shopper_count": shopper_count,
            "created_at": cohort.created_at.isoformat() if cohort.created_at else None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating cohort: {str(e)}")


@router.post("/segment", status_code=status.HTTP_201_CREATED)
async def create_segment_cohort(
    request: CreateSegmentCohortRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a cohort from a segmentation result"""
    start_time = time.time()
    try:
        ensure_cohort_members_table()
        
        # Build query using the segment query builder
        try:
            query = build_segment_query(
                segment_type=request.segment_type,
                start_date=request.start_date,
                end_date=request.end_date,
                criteria=request.segment_criteria
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        
        # Execute query with scope filtering
        role_name = get_user_role_name(current_user)
        shoppers = execute_snowflake_query(query, role_name=role_name)
        shopper_ids = [r['SHOPPER_ID'] for r in shoppers]
        shopper_count = len(shopper_ids)
        
        if shopper_count == 0:
            raise HTTPException(status_code=400, detail="No shoppers in this segment")
        
        # Create cohort metadata
        cohort = ShopperCohort(
            user_id=current_user.id,
            name=request.name,
            description=request.description,
            cohort_type="segment",
            definition=json.dumps({
                "segment_type": request.segment_type,
                "segment_name": request.segment_name,
                "segment_criteria": request.segment_criteria,
                "start_date": request.start_date,
                "end_date": request.end_date
            }),
            shopper_count=shopper_count
        )
        db.add(cohort)
        db.commit()
        db.refresh(cohort)
        
        # Save to Snowflake using helper function
        save_cohort_members(current_user.id, cohort.id, shopper_ids)
        
        execution_time = (time.time() - start_time) * 1000
        
        # Log the report execution
        log_report_execution(
            db=db,
            user_id=current_user.id,
            report_type="segment_cohort_create",
            parameters={
                "name": request.name,
                "segment_type": request.segment_type,
                "segment_name": request.segment_name,
                "segment_criteria": request.segment_criteria,
                "start_date": request.start_date,
                "end_date": request.end_date
            },
            results_summary={"cohort_id": cohort.id, "shopper_count": shopper_count},
            row_count=shopper_count,
            execution_time_ms=execution_time
        )
        
        return {
            "id": cohort.id,
            "name": cohort.name,
            "description": cohort.description,
            "cohort_type": cohort.cohort_type,
            "shopper_count": shopper_count,
            "created_at": cohort.created_at.isoformat() if cohort.created_at else None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating segment cohort: {str(e)}")


@router.get("")
async def list_cohorts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all cohorts for the current user"""
    cohorts = db.query(ShopperCohort).filter(
        ShopperCohort.user_id == current_user.id,
        ShopperCohort.is_active == True
    ).order_by(desc(ShopperCohort.created_at)).all()
    
    return {
        "cohorts": [
            {
                "id": c.id,
                "name": c.name,
                "description": c.description,
                "cohort_type": c.cohort_type,
                "shopper_count": c.shopper_count,
                "definition": json.loads(c.definition) if c.definition else {},
                "created_at": c.created_at.isoformat() if c.created_at else None
            }
            for c in cohorts
        ]
    }


@router.get("/{cohort_id}")
async def get_cohort(
    cohort_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get details of a specific cohort"""
    cohort = db.query(ShopperCohort).filter(
        ShopperCohort.id == cohort_id,
        ShopperCohort.user_id == current_user.id
    ).first()
    
    if not cohort:
        raise HTTPException(status_code=404, detail="Cohort not found")
    
    return {
        "id": cohort.id,
        "name": cohort.name,
        "description": cohort.description,
        "cohort_type": cohort.cohort_type,
        "shopper_count": cohort.shopper_count,
        "definition": json.loads(cohort.definition) if cohort.definition else {},
        "created_at": cohort.created_at.isoformat() if cohort.created_at else None
    }


@router.delete("/{cohort_id}")
async def delete_cohort(
    cohort_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a cohort"""
    cohort = db.query(ShopperCohort).filter(
        ShopperCohort.id == cohort_id,
        ShopperCohort.user_id == current_user.id
    ).first()
    
    if not cohort:
        raise HTTPException(status_code=404, detail="Cohort not found")
    
    # Delete from Snowflake
    try:
        execute_snowflake_query(delete_cohort_members_sql(current_user.id, cohort_id))
    except Exception as e:
        print(f"Error deleting cohort members from Snowflake: {e}")
    
    # Soft delete in PostgreSQL
    cohort.is_active = False
    db.commit()
    
    return {"status": "deleted", "id": cohort_id}


# ============== Lookalike Expansion Endpoints ==============

@router.post("/lookalike/preview")
async def preview_lookalike_expansion(
    request: LookalikeExpansionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Preview lookalike expansion for a seed cohort.
    Finds similar shoppers based on behavioral features.
    """
    start_time = time.time()
    
    # Verify seed cohort exists and belongs to user
    seed_cohort = db.query(ShopperCohort).filter(
        ShopperCohort.id == request.seed_cohort_id,
        ShopperCohort.user_id == current_user.id,
        ShopperCohort.is_active == True
    ).first()
    
    if not seed_cohort:
        raise HTTPException(status_code=404, detail="Seed cohort not found")
    
    role_name = get_user_role_name(current_user)
    
    try:
        # Step 1: Get seed cohort shopper IDs
        seed_query = seed_cohort_query(current_user.id, request.seed_cohort_id)
        seed_shoppers = execute_snowflake_query(seed_query, role_name=role_name)
        seed_shopper_ids = [s['SHOPPER_ID'] for s in seed_shoppers]
        
        if not seed_shopper_ids:
            raise HTTPException(status_code=400, detail="Seed cohort has no members")
        
        # Step 2: Build the lookalike query based on selected features
        # Calculate target size for expansion
        target_size = min(
            int(len(seed_shopper_ids) * request.expansion_factor),
            request.max_audience_size or 10000
        )
        
        # Build feature-based lookalike query using configurable table names
        seed_cte = seed_cohort_cte(current_user.id, request.seed_cohort_id)
        
        lookalike_query = f"""
        WITH {seed_cte},
        -- Seed cohort's category profile (aggregated)
        seed_categories AS (
            SELECT p.category, COUNT(DISTINCT ti.transaction_id) as category_count
            FROM {tables.TRANSACTIONS} t
            JOIN {tables.TRANSACTION_ITEMS} ti ON t.transaction_id = ti.transaction_id
            JOIN {tables.PRODUCTS} p ON ti.upc = p.upc
            JOIN seed_shoppers ss ON t.shopper_id = ss.shopper_id
            WHERE t.transaction_date >= DATEADD('day', -90, {anchor_sql()})
            GROUP BY p.category
            HAVING COUNT(DISTINCT ti.transaction_id) >= 2
        ),
        -- Count of seed categories (materialized)
        seed_category_count AS (
            SELECT COUNT(*) as cnt FROM seed_categories
        ),
        -- Seed cohort's brand profile (aggregated)
        seed_brands AS (
            SELECT p.brand, COUNT(DISTINCT ti.transaction_id) as brand_count
            FROM {tables.TRANSACTIONS} t
            JOIN {tables.TRANSACTION_ITEMS} ti ON t.transaction_id = ti.transaction_id
            JOIN {tables.PRODUCTS} p ON ti.upc = p.upc
            JOIN seed_shoppers ss ON t.shopper_id = ss.shopper_id
            WHERE t.transaction_date >= DATEADD('day', -90, {anchor_sql()})
            GROUP BY p.brand
            HAVING COUNT(DISTINCT ti.transaction_id) >= 2
        ),
        -- Count of seed brands (materialized)
        seed_brand_count AS (
            SELECT COUNT(*) as cnt FROM seed_brands
        ),
        -- Seed cohort's avg behavioral metrics
        seed_shopper_behavior AS (
            SELECT 
                t.shopper_id,
                COUNT(DISTINCT t.transaction_id) as visit_count,
                SUM(ti.quantity * ti.unit_price) as total_spend
            FROM {tables.TRANSACTIONS} t
            JOIN {tables.TRANSACTION_ITEMS} ti ON t.transaction_id = ti.transaction_id
            JOIN seed_shoppers ss ON t.shopper_id = ss.shopper_id
            WHERE t.transaction_date >= DATEADD('day', -90, {anchor_sql()})
            GROUP BY t.shopper_id
        ),
        seed_behavior AS (
            SELECT 
                AVG(visit_count) as avg_visits,
                AVG(total_spend) as avg_spend,
                COALESCE(STDDEV(visit_count), 1) as std_visits,
                COALESCE(STDDEV(total_spend), 1) as std_spend
            FROM seed_shopper_behavior
        ),
        -- All candidate shoppers with their behavior (not in seed, with recent activity)
        candidate_behavior AS (
            SELECT 
                t.shopper_id,
                COUNT(DISTINCT t.transaction_id) as visit_count,
                SUM(ti.quantity * ti.unit_price) as total_spend
            FROM {tables.TRANSACTIONS} t
            JOIN {tables.TRANSACTION_ITEMS} ti ON t.transaction_id = ti.transaction_id
            LEFT JOIN seed_shoppers ss ON t.shopper_id = ss.shopper_id
            WHERE ss.shopper_id IS NULL  -- Not in seed cohort
            AND t.transaction_date >= DATEADD('day', -90, {anchor_sql()})
            GROUP BY t.shopper_id
            HAVING COUNT(DISTINCT t.transaction_id) >= 1
        ),
        -- Score each candidate based on category overlap
        candidate_category_score AS (
            SELECT 
                cb.shopper_id,
                COUNT(DISTINCT p.category) as matching_categories
            FROM candidate_behavior cb
            JOIN {tables.TRANSACTIONS} t ON cb.shopper_id = t.shopper_id
            JOIN {tables.TRANSACTION_ITEMS} ti ON t.transaction_id = ti.transaction_id
            JOIN {tables.PRODUCTS} p ON ti.upc = p.upc
            JOIN seed_categories sc ON p.category = sc.category
            WHERE t.transaction_date >= DATEADD('day', -90, {anchor_sql()})
            GROUP BY cb.shopper_id
        ),
        -- Score each candidate based on brand overlap
        candidate_brand_score AS (
            SELECT 
                cb.shopper_id,
                COUNT(DISTINCT p.brand) as matching_brands
            FROM candidate_behavior cb
            JOIN {tables.TRANSACTIONS} t ON cb.shopper_id = t.shopper_id
            JOIN {tables.TRANSACTION_ITEMS} ti ON t.transaction_id = ti.transaction_id
            JOIN {tables.PRODUCTS} p ON ti.upc = p.upc
            JOIN seed_brands sb ON p.brand = sb.brand
            WHERE t.transaction_date >= DATEADD('day', -90, {anchor_sql()})
            GROUP BY cb.shopper_id
        ),
        -- Final scoring with all metrics joined
        scored_candidates AS (
            SELECT 
                cb.shopper_id,
                cb.visit_count,
                cb.total_spend,
                COALESCE(ccs.matching_categories, 0) as matching_categories,
                COALESCE(cbs.matching_brands, 0) as matching_brands,
                scc.cnt as total_seed_categories,
                sbc.cnt as total_seed_brands,
                sbh.avg_visits,
                sbh.avg_spend,
                sbh.std_visits,
                sbh.std_spend
            FROM candidate_behavior cb
            LEFT JOIN candidate_category_score ccs ON cb.shopper_id = ccs.shopper_id
            LEFT JOIN candidate_brand_score cbs ON cb.shopper_id = cbs.shopper_id
            CROSS JOIN seed_category_count scc
            CROSS JOIN seed_brand_count sbc
            CROSS JOIN seed_behavior sbh
        )
        SELECT 
            shopper_id,
            -- Category similarity score (0-1)
            CASE WHEN total_seed_categories > 0 
                 THEN matching_categories * 1.0 / total_seed_categories 
                 ELSE 0 END as category_score,
            -- Brand similarity score (0-1)  
            CASE WHEN total_seed_brands > 0 
                 THEN matching_brands * 1.0 / total_seed_brands 
                 ELSE 0 END as brand_score,
            -- Frequency similarity (normalized distance, converted to 0-1 score)
            CASE WHEN std_visits > 0 
                 THEN GREATEST(0, 1 - ABS(visit_count - avg_visits) / (3 * std_visits))
                 ELSE 0.5 END as frequency_score,
            -- Spend similarity
            CASE WHEN std_spend > 0 
                 THEN GREATEST(0, 1 - ABS(total_spend - avg_spend) / (3 * std_spend))
                 ELSE 0.5 END as spend_score,
            -- Weighted overall similarity score
            (
                0.35 * CASE WHEN total_seed_categories > 0 THEN matching_categories * 1.0 / total_seed_categories ELSE 0 END + 
                0.25 * CASE WHEN total_seed_brands > 0 THEN matching_brands * 1.0 / total_seed_brands ELSE 0 END + 
                0.20 * CASE WHEN std_visits > 0 THEN GREATEST(0, 1 - ABS(visit_count - avg_visits) / (3 * std_visits)) ELSE 0.5 END + 
                0.20 * CASE WHEN std_spend > 0 THEN GREATEST(0, 1 - ABS(total_spend - avg_spend) / (3 * std_spend)) ELSE 0.5 END
            ) as similarity_score,
            visit_count,
            ROUND(total_spend, 2) as total_spend
        FROM scored_candidates
        WHERE (
            matching_categories > 0 OR matching_brands > 0  -- Has category/brand overlap
            OR (CASE WHEN std_visits > 0 THEN GREATEST(0, 1 - ABS(visit_count - avg_visits) / (3 * std_visits)) ELSE 0.5 END) > 0.4  -- Or similar frequency
            OR (CASE WHEN std_spend > 0 THEN GREATEST(0, 1 - ABS(total_spend - avg_spend) / (3 * std_spend)) ELSE 0.5 END) > 0.4  -- Or similar spend
        )
        ORDER BY similarity_score DESC
        LIMIT {target_size}
        """
        
        lookalikes = execute_snowflake_query(lookalike_query, role_name=role_name)
        
        # Count total available candidates (for context)
        candidates_count_query = f"""
            SELECT COUNT(DISTINCT t.shopper_id) as total_candidates
            FROM {tables.TRANSACTIONS} t
            LEFT JOIN {tables.COHORT_MEMBERS} cm ON t.shopper_id = cm.shopper_id 
                AND cm.user_id = {current_user.id} 
                AND cm.cohort_id = {request.seed_cohort_id}
            WHERE cm.shopper_id IS NULL
            AND t.transaction_date >= DATEADD('day', -90, {anchor_sql()})
        """
        candidates_result = execute_snowflake_query(candidates_count_query, role_name=role_name)
        total_candidates = candidates_result[0]['TOTAL_CANDIDATES'] if candidates_result else 0
        
        execution_time = (time.time() - start_time) * 1000
        
        # Log the report execution
        log_report_execution(
            db=db,
            user_id=current_user.id,
            report_type="lookalike_expansion",
            parameters={
                "seed_cohort_id": request.seed_cohort_id,
                "seed_cohort_name": seed_cohort.name,
                "expansion_factor": request.expansion_factor,
                "features": request.features
            },
            row_count=len(lookalikes),
            execution_time_ms=execution_time,
            results_summary={
                "seed_size": len(seed_shopper_ids),
                "lookalike_size": len(lookalikes),
                "target_size": target_size
            }
        )
        
        # Calculate score distribution for display
        if lookalikes:
            scores = [l['SIMILARITY_SCORE'] for l in lookalikes]
            avg_score = sum(scores) / len(scores)
            min_score = min(scores)
            max_score = max(scores)
        else:
            avg_score = min_score = max_score = 0
        
        return {
            "seed_cohort": {
                "id": seed_cohort.id,
                "name": seed_cohort.name,
                "shopper_count": len(seed_shopper_ids)
            },
            "expansion_params": {
                "expansion_factor": request.expansion_factor,
                "target_size": target_size,
                "max_audience_size": request.max_audience_size,
                "features": request.features
            },
            "lookalike_count": len(lookalikes),
            "total_candidates_available": total_candidates,
            "total_expanded_audience": len(seed_shopper_ids) + len(lookalikes),
            "score_distribution": {
                "avg": round(avg_score, 3),
                "min": round(min_score, 3),
                "max": round(max_score, 3)
            },
            "lookalike_shoppers": [
                {
                    "shopper_id": l['SHOPPER_ID'],
                    "similarity_score": round(l['SIMILARITY_SCORE'], 3),
                    "category_score": round(l.get('CATEGORY_SCORE', 0) or 0, 3),
                    "brand_score": round(l.get('BRAND_SCORE', 0) or 0, 3),
                    "frequency_score": round(l.get('FREQUENCY_SCORE', 0) or 0, 3),
                    "spend_score": round(l.get('SPEND_SCORE', 0) or 0, 3),
                }
                for l in lookalikes[:100]  # Return top 100 for preview
            ],
            "all_lookalike_ids": [l['SHOPPER_ID'] for l in lookalikes],  # Full list for saving
            "execution_time_ms": round(execution_time, 2)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error in lookalike expansion: {str(e)}")


@router.post("/lookalike/save")
async def save_lookalike_cohort(
    request: SaveLookalikeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Save an expanded lookalike audience as a new cohort.
    Includes both seed cohort members and new lookalikes.
    """
    start_time = time.time()
    
    # Verify seed cohort exists
    seed_cohort = db.query(ShopperCohort).filter(
        ShopperCohort.id == request.seed_cohort_id,
        ShopperCohort.user_id == current_user.id,
        ShopperCohort.is_active == True
    ).first()
    
    if not seed_cohort:
        raise HTTPException(status_code=404, detail="Seed cohort not found")
    
    if not request.lookalike_shopper_ids:
        raise HTTPException(status_code=400, detail="No lookalike shoppers provided")
    
    role_name = get_user_role_name(current_user)
    
    try:
        # Get seed cohort members
        seed_query = seed_cohort_query(current_user.id, request.seed_cohort_id)
        seed_shoppers = execute_snowflake_query(seed_query, role_name=role_name)
        seed_shopper_ids = [s['SHOPPER_ID'] for s in seed_shoppers]
        
        # Combine seed + lookalikes (unique)
        all_shopper_ids = list(set(seed_shopper_ids + request.lookalike_shopper_ids))
        
        # Create the cohort in PostgreSQL
        cohort = ShopperCohort(
            user_id=current_user.id,
            name=request.name,
            description=request.description,
            cohort_type="lookalike",
            definition=json.dumps({
                "seed_cohort_id": request.seed_cohort_id,
                "seed_cohort_name": seed_cohort.name,
                "seed_size": len(seed_shopper_ids),
                "lookalike_size": len(request.lookalike_shopper_ids),
                "expansion_params": request.expansion_params
            }),
            shopper_count=len(all_shopper_ids)
        )
        db.add(cohort)
        db.commit()
        db.refresh(cohort)
        
        # Ensure cohort_members table exists
        ensure_cohort_members_table()
        
        # Insert members into Snowflake in batches
        batch_size = 1000
        total_inserted = 0
        
        with snowflake_cursor() as (cursor, conn):
            for i in range(0, len(all_shopper_ids), batch_size):
                batch = all_shopper_ids[i:i + batch_size]
                cursor.execute(insert_cohort_members_sql(current_user.id, cohort.id, batch))
                total_inserted += len(batch)
            conn.commit()
        
        execution_time = (time.time() - start_time) * 1000
        
        # Log the action
        log_report_execution(
            db=db,
            user_id=current_user.id,
            report_type="lookalike_cohort_save",
            parameters={
                "seed_cohort_id": request.seed_cohort_id,
                "cohort_name": request.name,
                "expansion_params": request.expansion_params
            },
            row_count=len(all_shopper_ids),
            execution_time_ms=execution_time,
            results_summary={
                "cohort_id": cohort.id,
                "total_size": len(all_shopper_ids),
                "seed_size": len(seed_shopper_ids),
                "lookalike_size": len(request.lookalike_shopper_ids)
            }
        )
        
        return {
            "status": "saved",
            "cohort_id": cohort.id,
            "cohort_name": cohort.name,
            "composition": {
                "seed_shoppers": len(seed_shopper_ids),
                "lookalike_shoppers": len(request.lookalike_shopper_ids),
                "total_unique": len(all_shopper_ids)
            },
            "created_at": cohort.created_at.isoformat() if cohort.created_at else None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        # Rollback PostgreSQL if needed
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error saving lookalike cohort: {str(e)}")
