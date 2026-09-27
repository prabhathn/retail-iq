"""
Operations routes for product assortment management.
Includes product listing, editing with approval workflow.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from datetime import datetime
import json

from ..database import get_db, execute_snowflake_query, snowflake_cursor
from ..models import User, ProductEdit, PRODUCT_EDIT_STATUSES
from ..auth import get_current_user
from ..utils import get_user_role_name
from ..table_config import tables
from ..date_anchor import anchor_sql

router = APIRouter(prefix="/operations", tags=["Operations"])


# ============== Pydantic Models ==============

class ProductEditRequest(BaseModel):
    upc: str
    changes: Dict[str, Dict[str, Any]]  # {"field_name": {"old": value, "new": value}}
    reason: Optional[str] = None


class ProductEditReview(BaseModel):
    status: str  # 'approved' or 'rejected'
    notes: Optional[str] = None
    rejection_reason: Optional[str] = None


# ============== Assortment Endpoints ==============

@router.get("/assortment")
async def list_products(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=10, le=200, description="Items per page"),
    search: Optional[str] = Query(None, description="Search in product name, UPC, or brand"),
    category: Optional[str] = Query(None, description="Filter by category"),
    brand: Optional[str] = Query(None, description="Filter by brand"),
    subcategory: Optional[str] = Query(None, description="Filter by subcategory"),
    sort_by: str = Query("product_name", description="Sort column"),
    sort_order: str = Query("asc", description="Sort order: asc or desc"),
    current_user: User = Depends(get_current_user)
):
    """
    Get paginated list of products with filtering and search.
    Results are filtered by user's access scope.
    """
    try:
        role_name = get_user_role_name(current_user)
        
        # Build WHERE conditions
        conditions = ["1=1"]
        
        if search:
            search_escaped = search.replace("'", "''")
            conditions.append(f"""
                (LOWER(product_name) LIKE '%{search_escaped.lower()}%' 
                 OR upc LIKE '%{search_escaped}%'
                 OR LOWER(brand) LIKE '%{search_escaped.lower()}%')
            """)
        
        if category:
            conditions.append(f"category = '{category}'")
        
        if brand:
            conditions.append(f"brand = '{brand}'")
        
        if subcategory:
            conditions.append(f"subcategory = '{subcategory}'")
        
        where_clause = " AND ".join(conditions)
        
        # Validate sort column to prevent SQL injection
        valid_sort_columns = ["product_name", "upc", "brand", "category", "subcategory", "price"]
        if sort_by not in valid_sort_columns:
            sort_by = "product_name"
        
        sort_direction = "DESC" if sort_order.lower() == "desc" else "ASC"
        
        # Get total count
        count_query = f"""
            SELECT COUNT(*) as total
            FROM {tables.PRODUCTS}
            WHERE {where_clause}
        """
        count_result = execute_snowflake_query(count_query, role_name=role_name)
        total_count = count_result[0]['TOTAL'] if count_result else 0
        
        # Calculate pagination
        offset = (page - 1) * page_size
        total_pages = (total_count + page_size - 1) // page_size if total_count > 0 else 0
        
        # Get products with pagination
        products_query = f"""
            SELECT 
                upc,
                product_name,
                brand,
                category,
                subcategory,
                price
            FROM {tables.PRODUCTS}
            WHERE {where_clause}
            ORDER BY {sort_by} {sort_direction}
            LIMIT {page_size} OFFSET {offset}
        """
        products = execute_snowflake_query(products_query, role_name=role_name)
        
        return {
            "products": products,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total_count": total_count,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_prev": page > 1
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching products: {str(e)}")


@router.get("/assortment/filters")
async def get_assortment_filters(current_user: User = Depends(get_current_user)):
    """Get available filter options for the assortment table."""
    try:
        role_name = get_user_role_name(current_user)
        
        categories = execute_snowflake_query(
            f"SELECT DISTINCT category FROM {tables.PRODUCTS} WHERE category IS NOT NULL ORDER BY category",
            role_name=role_name
        )
        
        brands = execute_snowflake_query(
            f"SELECT DISTINCT brand FROM {tables.PRODUCTS} WHERE brand IS NOT NULL ORDER BY brand",
            role_name=role_name
        )
        
        subcategories = execute_snowflake_query(
            f"SELECT DISTINCT subcategory FROM {tables.PRODUCTS} WHERE subcategory IS NOT NULL ORDER BY subcategory",
            role_name=role_name
        )
        
        return {
            "categories": [c["CATEGORY"] for c in categories],
            "brands": [b["BRAND"] for b in brands],
            "subcategories": [s["SUBCATEGORY"] for s in subcategories]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching filters: {str(e)}")


@router.get("/assortment/{upc}")
async def get_product_detail(
    upc: str,
    current_user: User = Depends(get_current_user)
):
    """Get detailed information for a single product."""
    try:
        role_name = get_user_role_name(current_user)
        
        query = f"""
            SELECT 
                upc,
                product_name,
                brand,
                category,
                subcategory,
                price
            FROM {tables.PRODUCTS}
            WHERE upc = '{upc}'
        """
        result = execute_snowflake_query(query, role_name=role_name)
        
        if not result:
            raise HTTPException(status_code=404, detail="Product not found")
        
        return {"product": result[0]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching product: {str(e)}")


# ============== Product Edit Workflow ==============

@router.post("/assortment/{upc}/edit", status_code=status.HTTP_201_CREATED)
async def submit_product_edit(
    upc: str,
    request: ProductEditRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Submit a product edit request for review.
    Changes won't be applied until approved.
    """
    try:
        # Verify the product exists and user has access
        role_name = get_user_role_name(current_user)
        product_query = f"""
            SELECT product_name FROM {tables.PRODUCTS} WHERE upc = '{upc}'
        """
        product = execute_snowflake_query(product_query, role_name=role_name)
        
        if not product:
            raise HTTPException(status_code=404, detail="Product not found or access denied")
        
        # Create the edit request
        edit = ProductEdit(
            user_id=current_user.id,
            upc=upc,
            product_name=product[0].get('PRODUCT_NAME'),
            changes=json.dumps(request.changes),
            reason=request.reason,
            status="pending"
        )
        db.add(edit)
        db.commit()
        db.refresh(edit)
        
        return {
            "id": edit.id,
            "upc": edit.upc,
            "status": edit.status,
            "changes": request.changes,
            "submitted_at": edit.submitted_at.isoformat() if edit.submitted_at else None,
            "message": "Product edit submitted for review"
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error submitting edit: {str(e)}")


@router.get("/assortment/edits/pending")
async def list_pending_edits(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List all pending product edits.
    Admins see all pending edits, users see their own.
    """
    try:
        query = db.query(ProductEdit)
        
        # Filter: admins see all pending, users see their own
        if current_user.role != "admin":
            query = query.filter(ProductEdit.user_id == current_user.id)
        else:
            query = query.filter(ProductEdit.status.in_(["pending", "in_review"]))
        
        edits = query.order_by(desc(ProductEdit.submitted_at)).all()
        
        return {
            "edits": [
                {
                    "id": e.id,
                    "upc": e.upc,
                    "product_name": e.product_name,
                    "changes": json.loads(e.changes) if e.changes else {},
                    "reason": e.reason,
                    "status": e.status,
                    "status_info": PRODUCT_EDIT_STATUSES.get(e.status, {}),
                    "submitted_by": e.user.full_name if e.user else None,
                    "submitted_at": e.submitted_at.isoformat() if e.submitted_at else None,
                    "reviewed_at": e.reviewed_at.isoformat() if e.reviewed_at else None,
                    "reviewer_notes": e.reviewer_notes
                }
                for e in edits
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching edits: {str(e)}")


@router.get("/assortment/edits/my")
async def list_my_edits(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all edit requests submitted by the current user."""
    try:
        edits = db.query(ProductEdit).filter(
            ProductEdit.user_id == current_user.id
        ).order_by(desc(ProductEdit.submitted_at)).limit(50).all()
        
        return {
            "edits": [
                {
                    "id": e.id,
                    "upc": e.upc,
                    "product_name": e.product_name,
                    "changes": json.loads(e.changes) if e.changes else {},
                    "reason": e.reason,
                    "status": e.status,
                    "status_info": PRODUCT_EDIT_STATUSES.get(e.status, {}),
                    "submitted_at": e.submitted_at.isoformat() if e.submitted_at else None,
                    "reviewed_at": e.reviewed_at.isoformat() if e.reviewed_at else None,
                    "reviewer_notes": e.reviewer_notes,
                    "rejection_reason": e.rejection_reason
                }
                for e in edits
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching edits: {str(e)}")


@router.get("/assortment/edits/{edit_id}")
async def get_edit_detail(
    edit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get details of a specific edit request."""
    try:
        edit = db.query(ProductEdit).filter(ProductEdit.id == edit_id).first()
        
        if not edit:
            raise HTTPException(status_code=404, detail="Edit not found")
        
        # Users can only see their own edits, admins can see all
        if current_user.role != "admin" and edit.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        return {
            "edit": {
                "id": edit.id,
                "upc": edit.upc,
                "product_name": edit.product_name,
                "changes": json.loads(edit.changes) if edit.changes else {},
                "reason": edit.reason,
                "status": edit.status,
                "status_info": PRODUCT_EDIT_STATUSES.get(edit.status, {}),
                "submitted_by": edit.user.full_name if edit.user else None,
                "submitted_by_email": edit.user.email if edit.user else None,
                "submitted_at": edit.submitted_at.isoformat() if edit.submitted_at else None,
                "reviewed_by": edit.reviewer.full_name if edit.reviewer else None,
                "reviewed_at": edit.reviewed_at.isoformat() if edit.reviewed_at else None,
                "reviewer_notes": edit.reviewer_notes,
                "rejection_reason": edit.rejection_reason,
                "applied_at": edit.applied_at.isoformat() if edit.applied_at else None
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching edit: {str(e)}")


@router.post("/assortment/edits/{edit_id}/review")
async def review_product_edit(
    edit_id: int,
    review: ProductEditReview,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Approve or reject a product edit request.
    Only admins can review edits.
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if review.status not in ["approved", "rejected"]:
        raise HTTPException(status_code=400, detail="Status must be 'approved' or 'rejected'")
    
    try:
        edit = db.query(ProductEdit).filter(ProductEdit.id == edit_id).first()
        
        if not edit:
            raise HTTPException(status_code=404, detail="Edit not found")
        
        if edit.status not in ["pending", "in_review"]:
            raise HTTPException(status_code=400, detail=f"Edit cannot be reviewed - current status: {edit.status}")
        
        edit.status = review.status
        edit.reviewed_at = datetime.utcnow()
        edit.reviewed_by = current_user.id
        edit.reviewer_notes = review.notes
        
        if review.status == "rejected":
            edit.rejection_reason = review.rejection_reason
        
        db.commit()
        db.refresh(edit)
        
        return {
            "id": edit.id,
            "status": edit.status,
            "reviewed_at": edit.reviewed_at.isoformat() if edit.reviewed_at else None,
            "message": f"Edit {review.status}"
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error reviewing edit: {str(e)}")


@router.post("/assortment/edits/{edit_id}/apply")
async def apply_product_edit(
    edit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Apply an approved edit to the product data.
    This would update the Snowflake products table.
    NOTE: In a production system, this would execute UPDATE statements against Snowflake.
    For demo purposes, we just mark the edit as applied.
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        edit = db.query(ProductEdit).filter(ProductEdit.id == edit_id).first()
        
        if not edit:
            raise HTTPException(status_code=404, detail="Edit not found")
        
        if edit.status != "approved":
            raise HTTPException(status_code=400, detail="Only approved edits can be applied")
        
        # In production, this would execute:
        # UPDATE products SET field1 = new_value1, ... WHERE upc = edit.upc
        # For demo, we just mark it as applied
        
        changes = json.loads(edit.changes) if edit.changes else {}
        
        # Build and log the UPDATE that would be executed
        set_clauses = []
        for field, values in changes.items():
            new_value = values.get("new")
            if isinstance(new_value, str):
                set_clauses.append(f"{field} = '{new_value}'")
            elif new_value is not None:
                set_clauses.append(f"{field} = {new_value}")
        
        if set_clauses:
            update_sql = f"UPDATE {tables.PRODUCTS} SET {', '.join(set_clauses)} WHERE upc = '{edit.upc}'"
            print(f"[DEMO] Would execute: {update_sql}")
            
            # Uncomment to actually apply changes:
            # with snowflake_cursor() as (cursor, conn):
            #     cursor.execute(update_sql)
            #     conn.commit()
        
        edit.status = "applied"
        edit.applied_at = datetime.utcnow()
        db.commit()
        
        return {
            "id": edit.id,
            "status": edit.status,
            "applied_at": edit.applied_at.isoformat() if edit.applied_at else None,
            "message": "Edit applied successfully (demo mode - no actual changes made to Snowflake)"
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error applying edit: {str(e)}")


@router.post("/assortment/edits/{edit_id}/simulate-review")
async def simulate_edit_review(
    edit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Simulate the review process for demo purposes.
    Randomly approves or rejects the edit.
    """
    try:
        edit = db.query(ProductEdit).filter(ProductEdit.id == edit_id).first()
        
        if not edit:
            raise HTTPException(status_code=404, detail="Edit not found")
        
        if edit.status not in ["pending", "in_review"]:
            raise HTTPException(status_code=400, detail=f"Edit cannot be reviewed - current status: {edit.status}")
        
        import random
        is_approved = random.random() > 0.2  # 80% approval rate
        
        edit.status = "approved" if is_approved else "rejected"
        edit.reviewed_at = datetime.utcnow()
        edit.reviewed_by = current_user.id
        
        if is_approved:
            edit.reviewer_notes = "Approved. Changes look good and are compliant with product data standards."
        else:
            edit.reviewer_notes = "Changes require additional documentation or don't meet data quality standards."
            edit.rejection_reason = random.choice([
                "Missing required documentation",
                "Price change exceeds threshold",
                "Data quality issue",
                "Requires vendor confirmation"
            ])
        
        db.commit()
        db.refresh(edit)
        
        return {
            "id": edit.id,
            "status": edit.status,
            "reviewed_at": edit.reviewed_at.isoformat() if edit.reviewed_at else None,
            "reviewer_notes": edit.reviewer_notes,
            "rejection_reason": edit.rejection_reason,
            "message": f"Simulated review complete: {edit.status}"
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error simulating review: {str(e)}")


# ============== Status Metadata ==============

@router.get("/assortment/edit-statuses")
async def get_edit_statuses():
    """Get all available edit statuses with their metadata."""
    return {"statuses": PRODUCT_EDIT_STATUSES}


# ============== Store Assortment Endpoints ==============

@router.get("/store-assortment/stores")
async def list_stores(current_user: User = Depends(get_current_user)):
    """Get list of stores for the store selector."""
    try:
        role_name = get_user_role_name(current_user)
        
        query = f"""
            SELECT 
                store_id,
                store_name,
                region,
                store_type
            FROM {tables.STORES}
            ORDER BY store_name
        """
        stores = execute_snowflake_query(query, role_name=role_name)
        
        return {"stores": stores}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching stores: {str(e)}")


@router.get("/store-assortment")
async def get_store_assortment(
    store_id: str = Query(..., description="Store ID"),
    category: Optional[str] = Query(None, description="Filter by category"),
    current_user: User = Depends(get_current_user)
):
    """
    Get product assortment for a specific store with SKU velocity.
    Velocity is calculated as units sold per week over the last 4 weeks.
    """
    try:
        role_name = get_user_role_name(current_user)
        
        # Build category filter
        category_filter = ""
        if category:
            category_filter = f"AND p.category = '{category}'"
        
        # Query products with velocity calculation
        # Velocity = total units sold in store over last 4 weeks / 4
        query = f"""
            WITH store_sales AS (
                SELECT 
                    ti.upc,
                    SUM(ti.quantity) as total_units
                FROM {tables.TRANSACTION_ITEMS} ti
                JOIN {tables.TRANSACTIONS} t ON ti.transaction_id = t.transaction_id
                WHERE t.store_id = '{store_id}'
                  AND t.transaction_date >= DATEADD(week, -4, {anchor_sql()})
                GROUP BY ti.upc
            )
            SELECT 
                p.upc,
                p.product_name,
                p.brand,
                p.category,
                p.subcategory,
                p.price,
                COALESCE(ROUND(ss.total_units / 4.0, 1), 0) as velocity
            FROM {tables.PRODUCTS} p
            LEFT JOIN store_sales ss ON p.upc = ss.upc
            WHERE 1=1
            {category_filter}
            ORDER BY velocity DESC NULLS LAST, p.product_name
            LIMIT 500
        """
        
        products = execute_snowflake_query(query, role_name=role_name)
        
        return {"products": products}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching store assortment: {str(e)}")

