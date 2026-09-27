"""
Admin Configuration API Routes
Manage ad networks, creative formats, and ad dimensions
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
import json

from ..database import get_db
from ..models import (
    User, AdNetwork, CreativeFormat, AdDimension,
    DEFAULT_AD_NETWORKS, DEFAULT_CREATIVE_FORMATS, DEFAULT_AD_DIMENSIONS
)
from ..auth import get_current_user
from .. import date_anchor

router = APIRouter(prefix="/config", tags=["configuration"])


def require_admin(current_user: User = Depends(get_current_user)):
    """Dependency to ensure user is admin"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


# ============================================================================
# DATE ANCHOR (reference date derived from the data)
# ============================================================================

@router.get("/date-anchor")
async def get_date_anchor(current_user: User = Depends(get_current_user)):
    """The application's reference date, derived from MAX(transaction_date).

    The frontend uses this instead of the browser clock to seed default date
    ranges, so analytics pages land inside the data even when the dataset has
    fallen behind wall-clock today. See app/date_anchor.py for the rationale.

    Available to any authenticated user. The underlying probe runs as
    RETAILIQ_ROLE_ADMIN so the anchor is identical for every persona - a vendor
    and an admin must agree on what "today" means, even though they see
    different rows.
    """
    return date_anchor.status()


# ============================================================================
# AD NETWORKS
# ============================================================================

@router.get("/ad-networks")
async def get_ad_networks(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all ad networks (for admin: all; for users: active only)"""
    query = db.query(AdNetwork)
    if not include_inactive or current_user.role != "admin":
        query = query.filter(AdNetwork.is_active == True)
    
    networks = query.order_by(AdNetwork.sort_order, AdNetwork.name).all()
    
    return [
        {
            "id": n.id,
            "network_id": n.network_id,
            "name": n.name,
            "icon": n.icon,
            "category": n.category,
            "credentials": json.loads(n.credentials_schema),
            "is_active": n.is_active,
            "sort_order": n.sort_order,
        }
        for n in networks
    ]


@router.post("/ad-networks")
async def create_ad_network(
    network_id: str,
    name: str,
    category: str,
    credentials: List[dict],
    icon: str = "🔗",
    sort_order: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Create a new ad network (admin only)"""
    # Check for duplicate
    existing = db.query(AdNetwork).filter(AdNetwork.network_id == network_id).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Network '{network_id}' already exists")
    
    network = AdNetwork(
        network_id=network_id,
        name=name,
        icon=icon,
        category=category,
        credentials_schema=json.dumps(credentials),
        sort_order=sort_order,
    )
    db.add(network)
    db.commit()
    db.refresh(network)
    
    return {
        "id": network.id,
        "network_id": network.network_id,
        "name": network.name,
        "icon": network.icon,
        "category": network.category,
        "credentials": credentials,
        "is_active": network.is_active,
        "sort_order": network.sort_order,
    }


@router.put("/ad-networks/{network_id}")
async def update_ad_network(
    network_id: str,
    name: Optional[str] = None,
    icon: Optional[str] = None,
    category: Optional[str] = None,
    credentials: Optional[List[dict]] = None,
    is_active: Optional[bool] = None,
    sort_order: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Update an ad network (admin only)"""
    network = db.query(AdNetwork).filter(AdNetwork.network_id == network_id).first()
    if not network:
        raise HTTPException(status_code=404, detail="Network not found")
    
    if name is not None:
        network.name = name
    if icon is not None:
        network.icon = icon
    if category is not None:
        network.category = category
    if credentials is not None:
        network.credentials_schema = json.dumps(credentials)
    if is_active is not None:
        network.is_active = is_active
    if sort_order is not None:
        network.sort_order = sort_order
    
    db.commit()
    db.refresh(network)
    
    return {
        "id": network.id,
        "network_id": network.network_id,
        "name": network.name,
        "icon": network.icon,
        "category": network.category,
        "credentials": json.loads(network.credentials_schema),
        "is_active": network.is_active,
        "sort_order": network.sort_order,
    }


@router.delete("/ad-networks/{network_id}")
async def delete_ad_network(
    network_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Delete an ad network (admin only)"""
    network = db.query(AdNetwork).filter(AdNetwork.network_id == network_id).first()
    if not network:
        raise HTTPException(status_code=404, detail="Network not found")
    
    db.delete(network)
    db.commit()
    return {"success": True, "message": f"Network '{network_id}' deleted"}


# ============================================================================
# CREATIVE FORMATS
# ============================================================================

@router.get("/creative-formats")
async def get_creative_formats(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all creative formats"""
    query = db.query(CreativeFormat)
    if not include_inactive or current_user.role != "admin":
        query = query.filter(CreativeFormat.is_active == True)
    
    formats = query.order_by(CreativeFormat.sort_order, CreativeFormat.name).all()
    
    return [
        {
            "id": f.id,
            "format_id": f.format_id,
            "name": f.name,
            "description": f.description,
            "file_types": json.loads(f.file_types),
            "max_size_kb": f.max_size_kb,
            "is_active": f.is_active,
            "sort_order": f.sort_order,
        }
        for f in formats
    ]


@router.post("/creative-formats")
async def create_creative_format(
    format_id: str,
    name: str,
    file_types: List[str],
    description: str = "",
    max_size_kb: int = 150,
    sort_order: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Create a new creative format (admin only)"""
    existing = db.query(CreativeFormat).filter(CreativeFormat.format_id == format_id).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Format '{format_id}' already exists")
    
    fmt = CreativeFormat(
        format_id=format_id,
        name=name,
        description=description,
        file_types=json.dumps(file_types),
        max_size_kb=max_size_kb,
        sort_order=sort_order,
    )
    db.add(fmt)
    db.commit()
    db.refresh(fmt)
    
    return {
        "id": fmt.id,
        "format_id": fmt.format_id,
        "name": fmt.name,
        "description": fmt.description,
        "file_types": file_types,
        "max_size_kb": fmt.max_size_kb,
        "is_active": fmt.is_active,
        "sort_order": fmt.sort_order,
    }


@router.put("/creative-formats/{format_id}")
async def update_creative_format(
    format_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    file_types: Optional[List[str]] = None,
    max_size_kb: Optional[int] = None,
    is_active: Optional[bool] = None,
    sort_order: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Update a creative format (admin only)"""
    fmt = db.query(CreativeFormat).filter(CreativeFormat.format_id == format_id).first()
    if not fmt:
        raise HTTPException(status_code=404, detail="Format not found")
    
    if name is not None:
        fmt.name = name
    if description is not None:
        fmt.description = description
    if file_types is not None:
        fmt.file_types = json.dumps(file_types)
    if max_size_kb is not None:
        fmt.max_size_kb = max_size_kb
    if is_active is not None:
        fmt.is_active = is_active
    if sort_order is not None:
        fmt.sort_order = sort_order
    
    db.commit()
    db.refresh(fmt)
    
    return {
        "id": fmt.id,
        "format_id": fmt.format_id,
        "name": fmt.name,
        "description": fmt.description,
        "file_types": json.loads(fmt.file_types),
        "max_size_kb": fmt.max_size_kb,
        "is_active": fmt.is_active,
        "sort_order": fmt.sort_order,
    }


@router.delete("/creative-formats/{format_id}")
async def delete_creative_format(
    format_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Delete a creative format (admin only)"""
    fmt = db.query(CreativeFormat).filter(CreativeFormat.format_id == format_id).first()
    if not fmt:
        raise HTTPException(status_code=404, detail="Format not found")
    
    db.delete(fmt)
    db.commit()
    return {"success": True, "message": f"Format '{format_id}' deleted"}


# ============================================================================
# AD DIMENSIONS
# ============================================================================

@router.get("/ad-dimensions")
async def get_ad_dimensions(
    include_inactive: bool = False,
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all ad dimensions"""
    query = db.query(AdDimension)
    if not include_inactive or current_user.role != "admin":
        query = query.filter(AdDimension.is_active == True)
    if category:
        query = query.filter(AdDimension.category == category)
    
    dimensions = query.order_by(AdDimension.sort_order, AdDimension.dimension_id).all()
    
    return [
        {
            "id": d.id,
            "dimension_id": d.dimension_id,
            "name": d.name,
            "width": d.width,
            "height": d.height,
            "category": d.category,
            "is_active": d.is_active,
            "sort_order": d.sort_order,
        }
        for d in dimensions
    ]


@router.post("/ad-dimensions")
async def create_ad_dimension(
    dimension_id: str,
    name: str,
    width: int,
    height: int,
    category: str,
    sort_order: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Create a new ad dimension (admin only)"""
    existing = db.query(AdDimension).filter(AdDimension.dimension_id == dimension_id).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Dimension '{dimension_id}' already exists")
    
    dim = AdDimension(
        dimension_id=dimension_id,
        name=name,
        width=width,
        height=height,
        category=category,
        sort_order=sort_order,
    )
    db.add(dim)
    db.commit()
    db.refresh(dim)
    
    return {
        "id": dim.id,
        "dimension_id": dim.dimension_id,
        "name": dim.name,
        "width": dim.width,
        "height": dim.height,
        "category": dim.category,
        "is_active": dim.is_active,
        "sort_order": dim.sort_order,
    }


@router.put("/ad-dimensions/{dimension_id}")
async def update_ad_dimension(
    dimension_id: str,
    name: Optional[str] = None,
    width: Optional[int] = None,
    height: Optional[int] = None,
    category: Optional[str] = None,
    is_active: Optional[bool] = None,
    sort_order: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Update an ad dimension (admin only)"""
    dim = db.query(AdDimension).filter(AdDimension.dimension_id == dimension_id).first()
    if not dim:
        raise HTTPException(status_code=404, detail="Dimension not found")
    
    if name is not None:
        dim.name = name
    if width is not None:
        dim.width = width
    if height is not None:
        dim.height = height
    if category is not None:
        dim.category = category
    if is_active is not None:
        dim.is_active = is_active
    if sort_order is not None:
        dim.sort_order = sort_order
    
    db.commit()
    db.refresh(dim)
    
    return {
        "id": dim.id,
        "dimension_id": dim.dimension_id,
        "name": dim.name,
        "width": dim.width,
        "height": dim.height,
        "category": dim.category,
        "is_active": dim.is_active,
        "sort_order": dim.sort_order,
    }


@router.delete("/ad-dimensions/{dimension_id}")
async def delete_ad_dimension(
    dimension_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Delete an ad dimension (admin only)"""
    dim = db.query(AdDimension).filter(AdDimension.dimension_id == dimension_id).first()
    if not dim:
        raise HTTPException(status_code=404, detail="Dimension not found")
    
    db.delete(dim)
    db.commit()
    return {"success": True, "message": f"Dimension '{dimension_id}' deleted"}


# ============================================================================
# SEED/RESET DATA
# ============================================================================

@router.post("/seed")
async def seed_default_configs(
    reset: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Seed default configuration data (admin only)
    
    Args:
        reset: If True, delete existing data before seeding
    """
    results = {"ad_networks": 0, "creative_formats": 0, "ad_dimensions": 0}
    
    # Seed Ad Networks
    if reset:
        db.query(AdNetwork).delete()
    for network_data in DEFAULT_AD_NETWORKS:
        existing = db.query(AdNetwork).filter(AdNetwork.network_id == network_data["network_id"]).first()
        if not existing:
            network = AdNetwork(**network_data)
            db.add(network)
            results["ad_networks"] += 1
    
    # Seed Creative Formats
    if reset:
        db.query(CreativeFormat).delete()
    for format_data in DEFAULT_CREATIVE_FORMATS:
        existing = db.query(CreativeFormat).filter(CreativeFormat.format_id == format_data["format_id"]).first()
        if not existing:
            fmt = CreativeFormat(**format_data)
            db.add(fmt)
            results["creative_formats"] += 1
    
    # Seed Ad Dimensions
    if reset:
        db.query(AdDimension).delete()
    for dim_data in DEFAULT_AD_DIMENSIONS:
        existing = db.query(AdDimension).filter(AdDimension.dimension_id == dim_data["dimension_id"]).first()
        if not existing:
            dim = AdDimension(**dim_data)
            db.add(dim)
            results["ad_dimensions"] += 1
    
    db.commit()
    
    return {
        "success": True,
        "message": "Default configurations seeded",
        "created": results,
        "reset": reset
    }

