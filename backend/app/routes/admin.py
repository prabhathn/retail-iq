from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import Optional
from datetime import datetime, timedelta
import json

from ..database import get_db, execute_snowflake_query, snowflake_cursor
from ..models import (
    User, ActivityLog, ReportExecution, SavedReport, ShopperCohort, 
    Scope, ScopeEntitlement, ModuleAccess, GlobalModuleSettings, DatasetConfig,
    DataGenerationJob,
    AVAILABLE_MODULES, AVAILABLE_DATASETS, get_module_by_key, get_modules_requiring_dataset
)
from ..auth import get_current_user
from .. import date_anchor
from ..schemas import UserResponse
from ..table_config import tables
from pydantic import BaseModel
from typing import List, Dict

class ScopeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    is_admin: bool = False

class EntitlementCreate(BaseModel):
    tenant_type: str  # 'category', 'brand', 'all'
    tenant_id: Optional[str] = None  # 'Dairy', 'Kraft', None for 'all'

class UserUpdate(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    company: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password_reset_required: Optional[bool] = None
    scope_id: Optional[int] = None

class ScopeWithEntitlements(BaseModel):
    name: str
    description: Optional[str] = None
    is_admin: bool = False
    entitlements: List[EntitlementCreate] = []

router = APIRouter(prefix="/admin", tags=["Admin"])

def require_admin(current_user: User = Depends(get_current_user)):
    """Dependency to require admin role"""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user

@router.get("/stats")
async def get_admin_stats(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Get overview statistics for admin dashboard"""
    
    # User stats
    total_users = db.query(func.count(User.id)).scalar()
    active_users = db.query(func.count(User.id)).filter(User.is_active == True).scalar()
    
    # Activity stats (last 24 hours)
    yesterday = datetime.utcnow() - timedelta(days=1)
    recent_activities = db.query(func.count(ActivityLog.id)).filter(
        ActivityLog.created_at >= yesterday
    ).scalar()
    
    # Report stats (last 24 hours)
    recent_reports = db.query(func.count(ReportExecution.id)).filter(
        ReportExecution.created_at >= yesterday
    ).scalar()
    
    # Total reports
    total_reports = db.query(func.count(ReportExecution.id)).scalar()
    
    # Reports by type
    reports_by_type = db.query(
        ReportExecution.report_type,
        func.count(ReportExecution.id).label('count')
    ).group_by(ReportExecution.report_type).all()
    
    # Cohort stats
    total_cohorts = db.query(func.count(ShopperCohort.id)).filter(
        ShopperCohort.is_active == True
    ).scalar()
    recent_cohorts = db.query(func.count(ShopperCohort.id)).filter(
        ShopperCohort.is_active == True,
        ShopperCohort.created_at >= yesterday
    ).scalar()
    
    # Cohorts by type
    cohorts_by_type = db.query(
        ShopperCohort.cohort_type,
        func.count(ShopperCohort.id).label('count')
    ).filter(ShopperCohort.is_active == True).group_by(ShopperCohort.cohort_type).all()
    
    return {
        "users": {
            "total": total_users,
            "active": active_users
        },
        "activities": {
            "last_24h": recent_activities
        },
        "reports": {
            "total": total_reports,
            "last_24h": recent_reports,
            "by_type": {r.report_type: r.count for r in reports_by_type}
        },
        "cohorts": {
            "total": total_cohorts,
            "last_24h": recent_cohorts,
            "by_type": {c.cohort_type: c.count for c in cohorts_by_type}
        }
    }

@router.get("/users")
async def get_all_users(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Get all users with their activity counts and scope info"""
    
    users = db.query(User).order_by(desc(User.created_at)).offset(skip).limit(limit).all()
    
    result = []
    for user in users:
        activity_count = db.query(func.count(ActivityLog.id)).filter(
            ActivityLog.user_id == user.id
        ).scalar()
        report_count = db.query(func.count(ReportExecution.id)).filter(
            ReportExecution.user_id == user.id
        ).scalar()
        
        # Get scope info
        scope_info = None
        if user.scope:
            scope_info = {
                "id": user.scope.id,
                "name": user.scope.name,
                "is_admin": user.scope.is_admin
            }
        
        result.append({
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "company": user.company,
            "role": user.role,
            "is_active": user.is_active,
            "password_reset_required": getattr(user, 'password_reset_required', False),
            "scope": scope_info,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "last_login": user.last_login.isoformat() if user.last_login else None,
            "activity_count": activity_count,
            "report_count": report_count
        })
    
    total = db.query(func.count(User.id)).scalar()
    
    return {
        "users": result,
        "total": total,
        "skip": skip,
        "limit": limit
    }

@router.get("/users/{user_id}")
async def get_user_detail(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Get detailed info for a specific user including scope entitlements"""
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get scope with entitlements
    scope_info = None
    if user.scope:
        entitlements = db.query(ScopeEntitlement).filter(
            ScopeEntitlement.scope_id == user.scope.id
        ).all()
        
        scope_info = {
            "id": user.scope.id,
            "name": user.scope.name,
            "role_name": user.scope.role_name,
            "description": user.scope.description,
            "is_admin": user.scope.is_admin,
            "entitlements": [
                {
                    "id": e.id,
                    "tenant_type": e.tenant_type,
                    "tenant_id": e.tenant_id
                }
                for e in entitlements
            ]
        }
    
    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "company": user.company,
            "role": user.role,
            "is_active": user.is_active,
            "password_reset_required": getattr(user, 'password_reset_required', False),
            "scope_id": user.scope_id,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "last_login": user.last_login.isoformat() if user.last_login else None
        },
        "scope": scope_info
    }

@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Update user details"""
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check email uniqueness if changing
    if user_data.email and user_data.email != user.email:
        existing = db.query(User).filter(User.email == user_data.email).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")
        user.email = user_data.email
    
    if user_data.full_name is not None:
        user.full_name = user_data.full_name
    if user_data.company is not None:
        user.company = user_data.company
    if user_data.role is not None:
        if user_data.role not in ["analyst", "admin"]:
            raise HTTPException(status_code=400, detail="Invalid role")
        user.role = user_data.role
    if user_data.is_active is not None:
        user.is_active = user_data.is_active
    if user_data.password_reset_required is not None:
        user.password_reset_required = user_data.password_reset_required
    if user_data.scope_id is not None:
        # Verify scope exists
        if user_data.scope_id > 0:
            scope = db.query(Scope).filter(Scope.id == user_data.scope_id).first()
            if not scope:
                raise HTTPException(status_code=404, detail="Scope not found")
        user.scope_id = user_data.scope_id if user_data.scope_id > 0 else None
    
    db.commit()
    db.refresh(user)
    
    return {
        "status": "updated",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "company": user.company,
            "role": user.role,
            "is_active": user.is_active,
            "password_reset_required": getattr(user, 'password_reset_required', False),
            "scope_id": user.scope_id
        }
    }

@router.post("/users/{user_id}/scope", status_code=status.HTTP_201_CREATED)
async def create_user_scope(
    user_id: int,
    scope_data: ScopeWithEntitlements,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Create a new scope for a user with entitlements"""
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Generate a unique role_name with RETAILIQ_ROLE_ prefix (matches Snowflake role naming)
    import re
    role_name = re.sub(r'[^A-Z0-9_]', '_', scope_data.name.upper())
    role_name = f"RETAILIQ_ROLE_{role_name}_{user_id}"
    
    # Create the scope
    scope = Scope(
        name=scope_data.name,
        role_name=role_name,
        description=scope_data.description,
        is_admin=scope_data.is_admin
    )
    db.add(scope)
    db.flush()  # Get the scope ID
    
    # Add entitlements
    for ent in scope_data.entitlements:
        db.add(ScopeEntitlement(
            scope_id=scope.id,
            tenant_type=ent.tenant_type,
            tenant_id=ent.tenant_id
        ))
    
    # Assign to user
    user.scope_id = scope.id
    db.commit()
    
    return {
        "status": "created",
        "scope": {
            "id": scope.id,
            "name": scope.name,
            "role_name": scope.role_name
        },
        "user_id": user_id
    }

@router.put("/users/{user_id}/role")
async def update_user_role(
    user_id: int,
    role: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Update a user's role"""
    
    if role not in ["analyst", "admin"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.role = role
    db.commit()
    
    return {"status": "updated", "user_id": user_id, "new_role": role}

@router.put("/users/{user_id}/status")
async def update_user_status(
    user_id: int,
    is_active: bool,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Activate or deactivate a user"""
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.is_active = is_active
    db.commit()
    
    return {"status": "updated", "user_id": user_id, "is_active": is_active}

@router.get("/activities")
async def get_all_activities(
    skip: int = 0,
    limit: int = 100,
    user_id: Optional[int] = None,
    action_type: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Get activity logs with optional filters"""
    
    query = db.query(ActivityLog).join(User)
    
    if user_id:
        query = query.filter(ActivityLog.user_id == user_id)
    if action_type:
        query = query.filter(ActivityLog.action_type == action_type)
    
    total = query.count()
    activities = query.order_by(desc(ActivityLog.created_at)).offset(skip).limit(limit).all()
    
    return {
        "activities": [
            {
                "id": a.id,
                "user_id": a.user_id,
                "user_email": a.user.email,
                "user_name": a.user.full_name,
                "action_type": a.action_type,
                "action_detail": a.action_detail,
                "metadata": json.loads(a.extra_data) if a.extra_data else None,
                "ip_address": a.ip_address,
                "created_at": a.created_at.isoformat() if a.created_at else None
            }
            for a in activities
        ],
        "total": total,
        "skip": skip,
        "limit": limit
    }

@router.get("/reports")
async def get_all_report_executions(
    skip: int = 0,
    limit: int = 100,
    user_id: Optional[int] = None,
    report_type: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Get report execution logs with optional filters"""
    
    query = db.query(ReportExecution).join(User)
    
    if user_id:
        query = query.filter(ReportExecution.user_id == user_id)
    if report_type:
        query = query.filter(ReportExecution.report_type == report_type)
    
    total = query.count()
    reports = query.order_by(desc(ReportExecution.created_at)).offset(skip).limit(limit).all()
    
    return {
        "reports": [
            {
                "id": r.id,
                "user_id": r.user_id,
                "user_email": r.user.email,
                "user_name": r.user.full_name,
                "report_type": r.report_type,
                "parameters": json.loads(r.parameters) if r.parameters else None,
                "results_summary": json.loads(r.results_summary) if r.results_summary else None,
                "row_count": r.row_count,
                "execution_time_ms": r.execution_time_ms,
                "status": r.status,
                "error_message": r.error_message,
                "created_at": r.created_at.isoformat() if r.created_at else None
            }
            for r in reports
        ],
        "total": total,
        "skip": skip,
        "limit": limit
    }

@router.get("/reports/{report_id}")
async def get_report_detail(
    report_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Get detailed info for a specific report execution"""
    
    report = db.query(ReportExecution).filter(ReportExecution.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    return {
        "id": report.id,
        "user_id": report.user_id,
        "user_email": report.user.email,
        "user_name": report.user.full_name,
        "report_type": report.report_type,
        "parameters": json.loads(report.parameters) if report.parameters else None,
        "results_summary": json.loads(report.results_summary) if report.results_summary else None,
        "row_count": report.row_count,
        "execution_time_ms": report.execution_time_ms,
        "status": report.status,
        "error_message": report.error_message,
        "created_at": report.created_at.isoformat() if report.created_at else None
    }

@router.get("/cohorts")
async def get_all_cohorts(
    skip: int = 0,
    limit: int = 100,
    user_id: Optional[int] = None,
    cohort_type: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Get all shopper cohorts with optional filters"""
    
    query = db.query(ShopperCohort).join(User)
    
    # Only show active cohorts by default
    query = query.filter(ShopperCohort.is_active == True)
    
    if user_id:
        query = query.filter(ShopperCohort.user_id == user_id)
    if cohort_type:
        query = query.filter(ShopperCohort.cohort_type == cohort_type)
    
    total = query.count()
    cohorts = query.order_by(desc(ShopperCohort.created_at)).offset(skip).limit(limit).all()
    
    return {
        "cohorts": [
            {
                "id": c.id,
                "user_id": c.user_id,
                "user_email": c.user.email,
                "user_name": c.user.full_name,
                "name": c.name,
                "description": c.description,
                "cohort_type": c.cohort_type,
                "definition": json.loads(c.definition) if c.definition else None,
                "shopper_count": c.shopper_count,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None
            }
            for c in cohorts
        ],
        "total": total,
        "skip": skip,
        "limit": limit
    }

@router.get("/cohorts/{cohort_id}")
async def get_cohort_detail(
    cohort_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Get detailed info for a specific cohort"""
    
    cohort = db.query(ShopperCohort).filter(ShopperCohort.id == cohort_id).first()
    if not cohort:
        raise HTTPException(status_code=404, detail="Cohort not found")
    
    return {
        "id": cohort.id,
        "user_id": cohort.user_id,
        "user_email": cohort.user.email,
        "user_name": cohort.user.full_name,
        "name": cohort.name,
        "description": cohort.description,
        "cohort_type": cohort.cohort_type,
        "definition": json.loads(cohort.definition) if cohort.definition else None,
        "shopper_count": cohort.shopper_count,
        "is_active": cohort.is_active,
        "created_at": cohort.created_at.isoformat() if cohort.created_at else None,
        "updated_at": cohort.updated_at.isoformat() if cohort.updated_at else None
    }

# ============== SCOPE MANAGEMENT ==============

@router.get("/scopes")
async def get_all_scopes(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Get all permission scopes"""
    scopes = db.query(Scope).order_by(Scope.id).all()
    
    result = []
    for scope in scopes:
        user_count = db.query(func.count(User.id)).filter(User.scope_id == scope.id).scalar()
        entitlements = db.query(ScopeEntitlement).filter(ScopeEntitlement.scope_id == scope.id).all()
        
        result.append({
            "id": scope.id,
            "name": scope.name,
            "description": scope.description,
            "is_admin": scope.is_admin,
            "user_count": user_count,
            "entitlements": [
                {
                    "id": e.id,
                    "tenant_type": e.tenant_type,
                    "tenant_id": e.tenant_id
                }
                for e in entitlements
            ],
            "created_at": scope.created_at.isoformat() if scope.created_at else None
        })
    
    return {"scopes": result}

@router.post("/scopes", status_code=status.HTTP_201_CREATED)
async def create_scope(
    scope_data: ScopeCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Create a new permission scope"""
    scope = Scope(
        name=scope_data.name,
        description=scope_data.description,
        is_admin=scope_data.is_admin
    )
    db.add(scope)
    db.commit()
    db.refresh(scope)
    
    return {
        "id": scope.id,
        "name": scope.name,
        "description": scope.description,
        "is_admin": scope.is_admin,
        "created_at": scope.created_at.isoformat() if scope.created_at else None
    }

@router.get("/scopes/{scope_id}")
async def get_scope_detail(
    scope_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Get detailed info for a specific scope"""
    scope = db.query(Scope).filter(Scope.id == scope_id).first()
    if not scope:
        raise HTTPException(status_code=404, detail="Scope not found")
    
    users = db.query(User).filter(User.scope_id == scope_id).all()
    entitlements = db.query(ScopeEntitlement).filter(ScopeEntitlement.scope_id == scope_id).all()
    
    return {
        "id": scope.id,
        "name": scope.name,
        "description": scope.description,
        "is_admin": scope.is_admin,
        "users": [
            {"id": u.id, "email": u.email, "full_name": u.full_name}
            for u in users
        ],
        "entitlements": [
            {"id": e.id, "tenant_type": e.tenant_type, "tenant_id": e.tenant_id}
            for e in entitlements
        ],
        "created_at": scope.created_at.isoformat() if scope.created_at else None
    }

@router.put("/scopes/{scope_id}")
async def update_scope(
    scope_id: int,
    scope_data: ScopeCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Update a scope"""
    scope = db.query(Scope).filter(Scope.id == scope_id).first()
    if not scope:
        raise HTTPException(status_code=404, detail="Scope not found")
    
    scope.name = scope_data.name
    scope.description = scope_data.description
    scope.is_admin = scope_data.is_admin
    db.commit()
    
    return {"status": "updated", "scope_id": scope_id}

@router.delete("/scopes/{scope_id}")
async def delete_scope(
    scope_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Delete a scope (fails if users are assigned)"""
    scope = db.query(Scope).filter(Scope.id == scope_id).first()
    if not scope:
        raise HTTPException(status_code=404, detail="Scope not found")
    
    user_count = db.query(func.count(User.id)).filter(User.scope_id == scope_id).scalar()
    if user_count > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete scope with {user_count} assigned users")
    
    # Delete entitlements first
    db.query(ScopeEntitlement).filter(ScopeEntitlement.scope_id == scope_id).delete()
    db.delete(scope)
    db.commit()
    
    return {"status": "deleted", "scope_id": scope_id}

@router.post("/scopes/{scope_id}/entitlements", status_code=status.HTTP_201_CREATED)
async def add_scope_entitlement(
    scope_id: int,
    entitlement: EntitlementCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Add an entitlement to a scope"""
    scope = db.query(Scope).filter(Scope.id == scope_id).first()
    if not scope:
        raise HTTPException(status_code=404, detail="Scope not found")
    
    # Check for duplicate
    existing = db.query(ScopeEntitlement).filter(
        ScopeEntitlement.scope_id == scope_id,
        ScopeEntitlement.tenant_type == entitlement.tenant_type,
        ScopeEntitlement.tenant_id == entitlement.tenant_id
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Entitlement already exists")
    
    ent = ScopeEntitlement(
        scope_id=scope_id,
        tenant_type=entitlement.tenant_type,
        tenant_id=entitlement.tenant_id
    )
    db.add(ent)
    db.commit()
    db.refresh(ent)
    
    return {
        "id": ent.id,
        "scope_id": scope_id,
        "tenant_type": ent.tenant_type,
        "tenant_id": ent.tenant_id
    }

@router.delete("/scopes/{scope_id}/entitlements/{entitlement_id}")
async def delete_scope_entitlement(
    scope_id: int,
    entitlement_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Remove an entitlement from a scope"""
    ent = db.query(ScopeEntitlement).filter(
        ScopeEntitlement.id == entitlement_id,
        ScopeEntitlement.scope_id == scope_id
    ).first()
    
    if not ent:
        raise HTTPException(status_code=404, detail="Entitlement not found")
    
    db.delete(ent)
    db.commit()
    
    return {"status": "deleted", "entitlement_id": entitlement_id}

@router.post("/scopes/sync-to-snowflake")
async def sync_scopes_to_snowflake(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Sync all scope entitlements to Snowflake role_entitlements table"""
    # Get all entitlements with their scope's role_name
    entitlements = db.query(ScopeEntitlement).join(Scope).all()
    
    with snowflake_cursor() as (cursor, conn):
        # Clear existing and re-insert
        cursor.execute("DELETE FROM role_entitlements")
        
        for ent in entitlements:
            # Get role_name from the related scope
            role_name = ent.scope.role_name if ent.scope and ent.scope.role_name else None
            if not role_name:
                continue  # Skip entitlements without a role_name
            
            tenant_id_sql = f"'{ent.tenant_id}'" if ent.tenant_id else "NULL"
            cursor.execute(f"""
                INSERT INTO role_entitlements (role_name, tenant_type, tenant_id)
                VALUES ('{role_name}', '{ent.tenant_type}', {tenant_id_sql})
            """)
        
        conn.commit()
    
    return {
        "status": "synced",
        "entitlements_count": len(entitlements)
    }

@router.put("/users/{user_id}/scope")
async def assign_user_scope(
    user_id: int,
    scope_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Assign a scope to a user"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if scope_id:
        scope = db.query(Scope).filter(Scope.id == scope_id).first()
        if not scope:
            raise HTTPException(status_code=404, detail="Scope not found")
    
    user.scope_id = scope_id
    db.commit()
    
    return {"status": "updated", "user_id": user_id, "scope_id": scope_id}

# ============== IMPERSONATION ==============

@router.post("/impersonate/{scope_id}")
async def impersonate_scope(
    scope_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Set impersonation scope for current admin (stored in response for frontend to use)"""
    scope = db.query(Scope).filter(Scope.id == scope_id).first()
    if not scope:
        raise HTTPException(status_code=404, detail="Scope not found")
    
    # Return the impersonation info - frontend will store and send with subsequent requests
    return {
        "impersonating": True,
        "scope_id": scope.id,
        "scope_name": scope.name,
        "is_admin_scope": scope.is_admin
    }

@router.delete("/impersonate")
async def clear_impersonation(
    admin: User = Depends(require_admin)
):
    """Clear impersonation"""
    return {
        "impersonating": False,
        "scope_id": None,
        "scope_name": None
    }

@router.get("/scope-options")
async def get_scope_options(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Get available categories and brands for scope builder"""
    # Use ADMIN role to see all data
    with snowflake_cursor(role_name='RETAILIQ_ROLE_ADMIN') as (cursor, conn):
        cursor.execute(f"SELECT DISTINCT category FROM {tables.PRODUCTS} ORDER BY category")
        categories = [row[0] for row in cursor.fetchall()]
        
        cursor.execute(f"SELECT DISTINCT brand FROM {tables.PRODUCTS} ORDER BY brand")
        brands = [row[0] for row in cursor.fetchall()]
    
    return {
        "categories": categories,
        "brands": brands
    }


# ============== MODULE ACCESS MANAGEMENT ==============

class ModuleAccessUpdate(BaseModel):
    modules: Dict[str, bool]  # module_key -> has_access


@router.get("/modules/available")
async def get_available_modules(admin: User = Depends(require_admin)):
    """Get list of all available modules in the system (simple list)"""
    return {"modules": AVAILABLE_MODULES}


@router.get("/users/{user_id}/modules")
async def get_user_module_access(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Get a user's module access permissions"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get existing access entries
    access_entries = db.query(ModuleAccess).filter(
        ModuleAccess.user_id == user_id
    ).all()
    
    if access_entries:
        access_map = {entry.module_key: entry.has_access for entry in access_entries}
    else:
        # No entries - default based on role
        is_admin_user = user.role == "admin"
        access_map = {module["key"]: is_admin_user for module in AVAILABLE_MODULES}
    
    return {
        "user_id": user_id,
        "modules": access_map,
        "available_modules": AVAILABLE_MODULES
    }


@router.put("/users/{user_id}/modules")
async def update_user_module_access(
    user_id: int,
    access_data: ModuleAccessUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Update a user's module access permissions"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Delete existing entries
    db.query(ModuleAccess).filter(ModuleAccess.user_id == user_id).delete()
    
    # Create new entries
    for module_key, has_access in access_data.modules.items():
        db.add(ModuleAccess(
            user_id=user_id,
            module_key=module_key,
            has_access=has_access
        ))
    
    db.commit()
    
    return {
        "status": "updated",
        "user_id": user_id,
        "modules": access_data.modules
    }


@router.post("/users/{user_id}/modules/grant-all")
async def grant_all_module_access(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Grant access to all modules for a user"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Delete existing entries
    db.query(ModuleAccess).filter(ModuleAccess.user_id == user_id).delete()
    
    # Create entries with full access
    for module in AVAILABLE_MODULES:
        db.add(ModuleAccess(
            user_id=user_id,
            module_key=module["key"],
            has_access=True
        ))
    
    db.commit()
    
    return {"status": "granted_all", "user_id": user_id}


@router.post("/users/{user_id}/modules/revoke-all")
async def revoke_all_module_access(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Revoke access to all modules for a user (except dashboard)"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Delete existing entries
    db.query(ModuleAccess).filter(ModuleAccess.user_id == user_id).delete()
    
    # Create entries with no access (except dashboard)
    for module in AVAILABLE_MODULES:
        db.add(ModuleAccess(
            user_id=user_id,
            module_key=module["key"],
            has_access=(module["key"] == "dashboard")  # Only dashboard access
        ))
    
    db.commit()
    
    return {"status": "revoked_all", "user_id": user_id}


# ============== SCHEMA CONFIGURATION ==============

@router.get("/schema-config")
async def get_schema_config(admin: User = Depends(require_admin)):
    """Get current table name configuration for admin visibility"""
    return {
        "table_mappings": tables.get_all(),
        "description": "Current Snowflake table name mappings. Configure via environment variables."
    }


# ============== GLOBAL MODULE SETTINGS ==============

class GlobalModuleSettingUpdate(BaseModel):
    is_enabled: bool
    disabled_reason: Optional[str] = None


@router.get("/modules")
async def get_all_modules(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Get all available modules with their global settings and dataset requirements.
    
    Returns each module with:
    - Module definition (key, label, section, description, requires_datasets)
    - Global settings (is_enabled, disabled_reason, disabled_at, disabled_by)
    """
    # Get all global settings
    settings = db.query(GlobalModuleSettings).all()
    settings_map = {s.module_key: s for s in settings}
    
    modules_with_settings = []
    for module in AVAILABLE_MODULES:
        setting = settings_map.get(module["key"])
        modules_with_settings.append({
            **module,
            "global_settings": {
                "is_enabled": setting.is_enabled if setting else True,
                "disabled_reason": setting.disabled_reason if setting else None,
                "disabled_at": setting.disabled_at.isoformat() if setting and setting.disabled_at else None,
                "disabled_by": setting.disabled_by.email if setting and setting.disabled_by else None,
            } if setting else {
                "is_enabled": True,
                "disabled_reason": None,
                "disabled_at": None,
                "disabled_by": None,
            }
        })
    
    return {
        "modules": modules_with_settings,
        "total": len(modules_with_settings),
    }


@router.get("/modules/settings")
async def get_global_module_settings(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Get all global module settings (only settings that have been explicitly set)"""
    settings = db.query(GlobalModuleSettings).all()
    
    return {
        "settings": [
            {
                "module_key": s.module_key,
                "is_enabled": s.is_enabled,
                "disabled_reason": s.disabled_reason,
                "disabled_at": s.disabled_at.isoformat() if s.disabled_at else None,
                "disabled_by": s.disabled_by.email if s.disabled_by else None,
            }
            for s in settings
        ]
    }


@router.put("/modules/settings/{module_key}")
async def update_global_module_setting(
    module_key: str,
    data: GlobalModuleSettingUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Update global settings for a specific module.
    
    When disabling a module:
    - is_enabled: False
    - disabled_reason: Optional explanation (e.g., "Under maintenance", "Dataset not connected")
    
    When enabling a module:
    - is_enabled: True
    - disabled_reason: Cleared
    """
    # Validate module exists
    module = get_module_by_key(module_key)
    if not module:
        raise HTTPException(status_code=404, detail=f"Module '{module_key}' not found")
    
    # Get or create setting
    setting = db.query(GlobalModuleSettings).filter(
        GlobalModuleSettings.module_key == module_key
    ).first()
    
    if setting:
        # Update existing
        setting.is_enabled = data.is_enabled
        setting.disabled_reason = data.disabled_reason if not data.is_enabled else None
        setting.disabled_at = datetime.utcnow() if not data.is_enabled else None
        setting.disabled_by_id = admin.id if not data.is_enabled else None
    else:
        # Create new
        setting = GlobalModuleSettings(
            module_key=module_key,
            is_enabled=data.is_enabled,
            disabled_reason=data.disabled_reason if not data.is_enabled else None,
            disabled_at=datetime.utcnow() if not data.is_enabled else None,
            disabled_by_id=admin.id if not data.is_enabled else None,
        )
        db.add(setting)
    
    db.commit()
    db.refresh(setting)
    
    return {
        "module_key": setting.module_key,
        "is_enabled": setting.is_enabled,
        "disabled_reason": setting.disabled_reason,
        "disabled_at": setting.disabled_at.isoformat() if setting.disabled_at else None,
        "disabled_by": admin.email if setting.disabled_by_id else None,
        "message": f"Module '{module_key}' {'enabled' if data.is_enabled else 'disabled'}"
    }


@router.delete("/modules/settings/{module_key}")
async def delete_global_module_setting(
    module_key: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Delete global setting for a module (reverts to default enabled state).
    """
    setting = db.query(GlobalModuleSettings).filter(
        GlobalModuleSettings.module_key == module_key
    ).first()
    
    if not setting:
        raise HTTPException(status_code=404, detail=f"No global setting found for module '{module_key}'")
    
    db.delete(setting)
    db.commit()
    
    return {
        "module_key": module_key,
        "message": f"Global setting for '{module_key}' deleted. Module reverted to default (enabled)."
    }


# ============== DATASETS ==============

@router.get("/datasets")
async def get_all_datasets(admin: User = Depends(require_admin)):
    """
    Get all available datasets with their dependent modules.
    
    This is used to show which modules will be affected when a dataset is connected/disconnected.
    """
    datasets_with_modules = []
    for dataset in AVAILABLE_DATASETS:
        dependent_modules = get_modules_requiring_dataset(dataset["key"])
        datasets_with_modules.append({
            **dataset,
            "dependent_modules": [
                {"key": m["key"], "label": m["label"], "section": m["section"]}
                for m in dependent_modules
            ],
            "dependent_module_count": len(dependent_modules),
        })
    
    return {
        "datasets": datasets_with_modules,
        "total": len(datasets_with_modules),
    }


@router.post("/modules/disable-by-dataset/{dataset_key}")
async def disable_modules_by_dataset(
    dataset_key: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Disable all modules that require a specific dataset.
    
    Use this when a dataset is disconnected or unavailable.
    """
    # Validate dataset exists
    dataset = next((d for d in AVAILABLE_DATASETS if d["key"] == dataset_key), None)
    if not dataset:
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_key}' not found")
    
    # Get modules requiring this dataset
    affected_modules = get_modules_requiring_dataset(dataset_key)
    
    if not affected_modules:
        return {
            "dataset_key": dataset_key,
            "affected_modules": [],
            "message": "No modules require this dataset"
        }
    
    # Disable each affected module
    disabled_modules = []
    for module in affected_modules:
        setting = db.query(GlobalModuleSettings).filter(
            GlobalModuleSettings.module_key == module["key"]
        ).first()
        
        if setting:
            setting.is_enabled = False
            setting.disabled_reason = f"Dataset '{dataset['label']}' not connected"
            setting.disabled_at = datetime.utcnow()
            setting.disabled_by_id = admin.id
        else:
            setting = GlobalModuleSettings(
                module_key=module["key"],
                is_enabled=False,
                disabled_reason=f"Dataset '{dataset['label']}' not connected",
                disabled_at=datetime.utcnow(),
                disabled_by_id=admin.id,
            )
            db.add(setting)
        
        disabled_modules.append(module["key"])
    
    db.commit()
    
    return {
        "dataset_key": dataset_key,
        "affected_modules": disabled_modules,
        "message": f"Disabled {len(disabled_modules)} modules that require '{dataset['label']}' dataset"
    }


@router.post("/modules/enable-by-dataset/{dataset_key}")
async def enable_modules_by_dataset(
    dataset_key: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Re-enable all modules that were disabled due to a specific dataset being unavailable.
    
    Use this when a dataset is reconnected.
    Note: This only re-enables modules that were disabled specifically due to this dataset.
    """
    # Validate dataset exists
    dataset = next((d for d in AVAILABLE_DATASETS if d["key"] == dataset_key), None)
    if not dataset:
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_key}' not found")
    
    # Get modules requiring this dataset
    affected_modules = get_modules_requiring_dataset(dataset_key)
    
    if not affected_modules:
        return {
            "dataset_key": dataset_key,
            "enabled_modules": [],
            "message": "No modules require this dataset"
        }
    
    # Re-enable each affected module (only if disabled due to this dataset)
    enabled_modules = []
    expected_reason = f"Dataset '{dataset['label']}' not connected"
    
    for module in affected_modules:
        setting = db.query(GlobalModuleSettings).filter(
            GlobalModuleSettings.module_key == module["key"]
        ).first()
        
        if setting and not setting.is_enabled and setting.disabled_reason == expected_reason:
            setting.is_enabled = True
            setting.disabled_reason = None
            setting.disabled_at = None
            setting.disabled_by_id = None
            enabled_modules.append(module["key"])
    
    db.commit()
    
    return {
        "dataset_key": dataset_key,
        "enabled_modules": enabled_modules,
        "message": f"Re-enabled {len(enabled_modules)} modules"
    }


# ============== DATASET CONFIGURATION ==============

class DatasetConfigUpdate(BaseModel):
    config: Optional[str] = None  # JSON string
    is_connected: Optional[bool] = None


@router.get("/datasets/config")
async def get_all_dataset_configs(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Get all dataset configurations with their connection status.
    Merges AVAILABLE_DATASETS with stored configs.
    """
    # Get all stored configs
    configs = db.query(DatasetConfig).all()
    configs_map = {c.dataset_key: c for c in configs}
    
    result = []
    for dataset in AVAILABLE_DATASETS:
        config = configs_map.get(dataset["key"])
        
        # Parse JSON config if exists
        parsed_config = None
        if config and config.config:
            try:
                parsed_config = json.loads(config.config)
            except json.JSONDecodeError:
                parsed_config = {"_raw": config.config, "_error": "Invalid JSON"}
        
        result.append({
            "key": dataset["key"],
            "label": dataset["label"],
            "description": dataset["description"],
            "is_connected": config.is_connected if config else False,
            "config": parsed_config,
            "last_verified_at": config.last_verified_at.isoformat() if config and config.last_verified_at else None,
            "verified_by": config.verified_by.email if config and config.verified_by else None,
            "updated_at": config.updated_at.isoformat() if config and config.updated_at else None,
            "updated_by": config.updated_by.email if config and config.updated_by else None,
        })
    
    return {
        "datasets": result,
        "total": len(result),
        "connected_count": sum(1 for d in result if d["is_connected"]),
    }


@router.get("/datasets/config/{dataset_key}")
async def get_dataset_config(
    dataset_key: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Get configuration for a specific dataset."""
    # Validate dataset exists
    dataset = next((d for d in AVAILABLE_DATASETS if d["key"] == dataset_key), None)
    if not dataset:
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_key}' not found")
    
    config = db.query(DatasetConfig).filter(
        DatasetConfig.dataset_key == dataset_key
    ).first()
    
    parsed_config = None
    if config and config.config:
        try:
            parsed_config = json.loads(config.config)
        except json.JSONDecodeError:
            parsed_config = {"_raw": config.config, "_error": "Invalid JSON"}
    
    return {
        "key": dataset["key"],
        "label": dataset["label"],
        "description": dataset["description"],
        "is_connected": config.is_connected if config else False,
        "config": parsed_config,
        "last_verified_at": config.last_verified_at.isoformat() if config and config.last_verified_at else None,
        "verified_by": config.verified_by.email if config and config.verified_by else None,
        "updated_at": config.updated_at.isoformat() if config and config.updated_at else None,
        "updated_by": config.updated_by.email if config and config.updated_by else None,
    }


@router.put("/datasets/config/{dataset_key}")
async def update_dataset_config(
    dataset_key: str,
    data: DatasetConfigUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Update configuration for a specific dataset."""
    # Validate dataset exists
    dataset = next((d for d in AVAILABLE_DATASETS if d["key"] == dataset_key), None)
    if not dataset:
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_key}' not found")
    
    # Validate JSON if provided
    if data.config:
        try:
            json.loads(data.config)
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON: {str(e)}")
    
    config = db.query(DatasetConfig).filter(
        DatasetConfig.dataset_key == dataset_key
    ).first()
    
    if config:
        if data.config is not None:
            config.config = data.config
        if data.is_connected is not None:
            config.is_connected = data.is_connected
        config.updated_by_id = admin.id
    else:
        config = DatasetConfig(
            dataset_key=dataset_key,
            config=data.config,
            is_connected=data.is_connected if data.is_connected is not None else False,
            updated_by_id=admin.id,
        )
        db.add(config)
    
    db.commit()
    db.refresh(config)
    
    return {
        "key": dataset_key,
        "is_connected": config.is_connected,
        "message": f"Dataset '{dataset['label']}' configuration updated"
    }


@router.post("/datasets/config/{dataset_key}/verify")
async def verify_dataset_connection(
    dataset_key: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Mark a dataset as verified/connected.
    In a real implementation, this would test the connection.
    """
    # Validate dataset exists
    dataset = next((d for d in AVAILABLE_DATASETS if d["key"] == dataset_key), None)
    if not dataset:
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_key}' not found")
    
    config = db.query(DatasetConfig).filter(
        DatasetConfig.dataset_key == dataset_key
    ).first()
    
    if config:
        config.is_connected = True
        config.last_verified_at = datetime.utcnow()
        config.verified_by_id = admin.id
    else:
        config = DatasetConfig(
            dataset_key=dataset_key,
            is_connected=True,
            last_verified_at=datetime.utcnow(),
            verified_by_id=admin.id,
            updated_by_id=admin.id,
        )
        db.add(config)
    
    db.commit()
    
    return {
        "key": dataset_key,
        "is_connected": True,
        "last_verified_at": config.last_verified_at.isoformat(),
        "message": f"Dataset '{dataset['label']}' marked as connected"
    }


@router.post("/datasets/config/seed")
async def seed_dataset_configs(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Seed default dataset configurations.
    Creates a config entry for each dataset in AVAILABLE_DATASETS.
    Core datasets (transactions, products, shoppers, stores) are marked as connected.
    """
    # Core datasets that should be connected by default
    core_datasets = {"transactions", "products", "shoppers", "stores"}
    
    created = []
    updated = []
    
    for dataset in AVAILABLE_DATASETS:
        existing = db.query(DatasetConfig).filter(
            DatasetConfig.dataset_key == dataset["key"]
        ).first()
        
        is_core = dataset["key"] in core_datasets
        
        # Default config templates based on dataset type
        default_config = get_default_config_template(dataset["key"])
        
        if existing:
            # Only update if config is empty
            if not existing.config:
                existing.config = json.dumps(default_config, indent=2)
                existing.updated_by_id = admin.id
                updated.append(dataset["key"])
        else:
            config = DatasetConfig(
                dataset_key=dataset["key"],
                is_connected=is_core,
                config=json.dumps(default_config, indent=2),
                last_verified_at=datetime.utcnow() if is_core else None,
                verified_by_id=admin.id if is_core else None,
                updated_by_id=admin.id,
            )
            db.add(config)
            created.append(dataset["key"])
    
    db.commit()
    
    return {
        "created": created,
        "updated": updated,
        "message": f"Seeded {len(created)} new configs, updated {len(updated)} existing"
    }


def get_default_config_template(dataset_key: str) -> dict:
    """Return a default configuration template for a dataset type."""
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
    
    return templates.get(dataset_key, {
        "type": "snowflake",
        "database": "${SNOWFLAKE_DATABASE}",
        "schema": "${SNOWFLAKE_SCHEMA}",
        "table": dataset_key,
        "notes": f"Configure connection for {dataset_key}"
    })



# ============================================================================
# DATA WINDOW (reference date + synthetic data top-up)
# ============================================================================
# The synthetic dataset is generated relative to whenever it was loaded, so it
# ages. RetailIQ compensates by deriving its reference date from the data (see
# app/date_anchor.py), and this section lets an admin see the gap and close it.

@router.get("/data-window/status")
async def get_data_window_status(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Data coverage, the resolved reference date, and the most recent top-up job."""
    state = date_anchor.status()

    last_job = (
        db.query(DataGenerationJob)
        .order_by(desc(DataGenerationJob.created_at))
        .first()
    )
    running = (
        db.query(DataGenerationJob)
        .filter(DataGenerationJob.status.in_(["pending", "running"]))
        .first()
    )

    return {
        **state,
        "active_job_id": running.id if running else None,
        "last_job": _job_to_dict(last_job) if last_job else None,
    }


@router.post("/data-window/refresh")
async def refresh_data_window(
    admin: User = Depends(require_admin)
):
    """Force a re-probe of MAX(transaction_date), bypassing the TTL."""
    date_anchor.invalidate()
    return date_anchor.status()


def _job_to_dict(job: "DataGenerationJob") -> dict:
    return {
        "id": job.id,
        "status": job.status,
        "target_date": job.target_date,
        "from_date": job.from_date,
        "days_added": job.days_added,
        "transactions_added": job.transactions_added,
        "items_added": job.items_added,
        "new_data_max_date": job.new_data_max_date,
        "progress_pct": job.progress_pct,
        "progress_stage": job.progress_stage,
        "progress_detail": job.progress_detail,
        "error": job.error,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
    }


def _run_extend_job(job_id: int, target_date_str: Optional[str]):
    """Background worker for a data top-up.

    Runs outside the request's DB session (that session is closed once the
    response is returned), so it opens its own.
    """
    from ..database import SessionLocal
    from scripts.extend_synthetic_data import extend as extend_data

    db = SessionLocal()
    try:
        job = db.query(DataGenerationJob).get(job_id)
        if not job:
            return
        job.status = "running"
        job.progress_stage = "starting"
        job.progress_pct = 1
        db.commit()

        def progress_cb(stage: str, pct: int, detail: str = ""):
            # Best-effort progress reporting; a failure here must not abort the run.
            try:
                job.progress_stage = stage
                job.progress_pct = pct
                job.progress_detail = (detail or "")[:255]
                db.commit()
            except Exception:
                db.rollback()

        target = (
            datetime.strptime(target_date_str, "%Y-%m-%d").date()
            if target_date_str
            else None
        )
        result = extend_data(target_date=target, progress_cb=progress_cb)

        # New sales days need the extended model (cost, promotions, inventory,
        # purchase orders, retail media) derived for them too, otherwise margin
        # and inventory would silently stop at the old right edge.
        if result.get("status") == "success":
            from scripts.extend_data_model import refresh as refresh_data_model
            refresh_data_model(
                skip_ddl=True,
                progress_cb=lambda stage, pct, detail="": progress_cb(f"data model: {stage}", pct, detail),
            )

        job.status = result.get("status", "failed")
        job.from_date = result.get("first_new_date")
        job.days_added = result.get("days_added") or 0
        job.transactions_added = result.get("transactions_added") or 0
        job.items_added = result.get("items_added") or 0
        job.new_data_max_date = result.get("new_data_max_date")
        job.error = result.get("error")
        job.finished_at = datetime.utcnow()
        if job.status in ("success", "noop"):
            job.progress_pct = 100
        db.commit()

        # Critical: the anchor cache still holds the pre-top-up MAX date. Without
        # this the app would keep reporting the old reference date until the TTL
        # expired or the server restarted - i.e. right after the operation meant
        # to fix staleness.
        if job.status == "success":
            date_anchor.invalidate()

    except Exception as exc:  # noqa: BLE001
        try:
            job = db.query(DataGenerationJob).get(job_id)
            if job:
                job.status = "failed"
                job.error = str(exc)[:2000]
                job.finished_at = datetime.utcnow()
                db.commit()
        except Exception:
            db.rollback()
    finally:
        db.close()


@router.post("/data-window/extend")
async def extend_data_window(
    background_tasks: BackgroundTasks,
    target_date: Optional[str] = None,
    dry_run: bool = False,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Append synthetic transactions from the data's last day up to target_date.

    Defaults to today. Runs as a background task; poll
    GET /admin/data-window/jobs/{id} for progress.

    A second request is rejected while a job is running: two concurrent appenders
    would each read the same MAX(transaction_id) and generate colliding IDs.
    """
    if dry_run:
        from scripts.extend_synthetic_data import extend as extend_data
        target = (
            datetime.strptime(target_date, "%Y-%m-%d").date() if target_date else None
        )
        return extend_data(target_date=target, dry_run=True)

    existing = (
        db.query(DataGenerationJob)
        .filter(DataGenerationJob.status.in_(["pending", "running"]))
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"A data top-up is already running (job {existing.id}). "
                "Concurrent runs would produce duplicate transaction IDs."
            ),
        )

    job = DataGenerationJob(
        status="pending",
        target_date=target_date or datetime.utcnow().strftime("%Y-%m-%d"),
        requested_by_id=admin.id,
        progress_pct=0,
        progress_stage="queued",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    background_tasks.add_task(_run_extend_job, job.id, target_date)

    return {"job_id": job.id, "status": job.status, "message": "Top-up started"}


@router.get("/data-window/jobs/{job_id}")
async def get_data_window_job(
    job_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Poll a top-up job's progress."""
    job = db.query(DataGenerationJob).get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_to_dict(job)


@router.get("/data-window/jobs")
async def list_data_window_jobs(
    limit: int = 10,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Recent top-up jobs, newest first."""
    jobs = (
        db.query(DataGenerationJob)
        .order_by(desc(DataGenerationJob.created_at))
        .limit(min(limit, 50))
        .all()
    )
    return [_job_to_dict(j) for j in jobs]
