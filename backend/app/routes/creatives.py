"""
API routes for managing ad creatives with legal review workflow.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
import json
from datetime import datetime
import random
import string

from ..database import get_db
from ..models import Creative, User, CreativeFormat, AdDimension, CREATIVE_STATUSES
from ..auth import get_current_user

router = APIRouter(prefix="/creatives", tags=["creatives"])


def get_format_from_db(db: Session, format_id: str) -> Optional[dict]:
    """Get a creative format from the database."""
    fmt = db.query(CreativeFormat).filter(
        CreativeFormat.format_id == format_id,
        CreativeFormat.is_active == True
    ).first()
    if not fmt:
        return None
    return {
        "id": fmt.format_id,
        "name": fmt.name,
        "description": fmt.description,
        "file_types": json.loads(fmt.file_types),
        "max_size_kb": fmt.max_size_kb,
    }


def get_dimension_from_db(db: Session, dimension_id: str) -> Optional[dict]:
    """Get an ad dimension from the database."""
    dim = db.query(AdDimension).filter(
        AdDimension.dimension_id == dimension_id,
        AdDimension.is_active == True
    ).first()
    if not dim:
        return None
    return {
        "id": dim.dimension_id,
        "name": dim.name,
        "width": dim.width,
        "height": dim.height,
        "category": dim.category,
    }


# ============== Pydantic Schemas ==============

class CreativeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    format_type: str
    dimensions: Optional[str] = None
    file_type: Optional[str] = None
    file_name: Optional[str] = None
    file_size_kb: Optional[int] = None
    landing_url: Optional[str] = None
    alt_text: Optional[str] = None
    advertiser_name: Optional[str] = None
    contains_animation: bool = False
    contains_audio: bool = False
    target_audience: str = "general"
    tags: Optional[List[str]] = None


class CreativeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    format_type: Optional[str] = None
    dimensions: Optional[str] = None
    file_type: Optional[str] = None
    file_name: Optional[str] = None
    file_size_kb: Optional[int] = None
    landing_url: Optional[str] = None
    alt_text: Optional[str] = None
    advertiser_name: Optional[str] = None
    contains_animation: Optional[bool] = None
    contains_audio: Optional[bool] = None
    target_audience: Optional[str] = None
    tags: Optional[List[str]] = None


class ReviewAction(BaseModel):
    action: str  # 'approve', 'reject', 'request_revision'
    reviewer_name: str = "Legal Team"
    notes: Optional[str] = None
    rejection_reason: Optional[str] = None


# ============== Helper Functions ==============

def generate_mock_file_url(format_type: str, dimensions: str) -> str:
    """Generate a mock file URL for demo purposes."""
    random_id = ''.join(random.choices(string.ascii_lowercase + string.digits, k=8))
    ext = "png" if format_type in ["static_image", "native"] else "gif" if format_type == "animated_gif" else "mp4" if format_type == "video" else "zip"
    return f"https://cdn.example.com/creatives/{random_id}_{dimensions}.{ext}"


def creative_to_response(creative: Creative, db: Session) -> dict:
    """Convert a Creative model to a response dict."""
    status_info = CREATIVE_STATUSES.get(creative.status, CREATIVE_STATUSES["draft"])
    format_info = get_format_from_db(db, creative.format_type) or {}
    dimension_info = get_dimension_from_db(db, creative.dimensions) if creative.dimensions else None
    
    return {
        "id": creative.id,
        "name": creative.name,
        "description": creative.description,
        "format_type": creative.format_type,
        "format_name": format_info.get("name", creative.format_type),
        "dimensions": creative.dimensions,
        "dimension_name": dimension_info["name"] if dimension_info else creative.dimensions,
        "file_type": creative.file_type,
        "file_name": creative.file_name,
        "file_url": creative.file_url,
        "file_size_kb": creative.file_size_kb,
        "landing_url": creative.landing_url,
        "alt_text": creative.alt_text,
        "advertiser_name": creative.advertiser_name,
        "contains_animation": creative.contains_animation,
        "contains_audio": creative.contains_audio,
        "target_audience": creative.target_audience,
        "status": creative.status,
        "status_label": status_info["label"],
        "status_color": status_info["color"],
        "status_description": status_info["description"],
        "submitted_at": creative.submitted_at,
        "reviewed_at": creative.reviewed_at,
        "reviewer_name": creative.reviewer_name,
        "reviewer_notes": creative.reviewer_notes,
        "rejection_reason": creative.rejection_reason,
        "tags": json.loads(creative.tags) if creative.tags else [],
        "is_active": creative.is_active,
        "created_at": creative.created_at,
        "updated_at": creative.updated_at,
    }


# ============== API Routes ==============

@router.get("/formats")
async def get_creative_formats(db: Session = Depends(get_db)):
    """Get available creative formats and ad dimensions."""
    # Get formats from database
    formats = db.query(CreativeFormat).filter(
        CreativeFormat.is_active == True
    ).order_by(CreativeFormat.sort_order, CreativeFormat.name).all()
    
    # Get dimensions from database
    dimensions = db.query(AdDimension).filter(
        AdDimension.is_active == True
    ).order_by(AdDimension.sort_order, AdDimension.dimension_id).all()
    
    return {
        "formats": [
            {
                "id": f.format_id,
                "name": f.name,
                "description": f.description,
                "file_types": json.loads(f.file_types),
                "max_size_kb": f.max_size_kb,
            }
            for f in formats
        ],
        "dimensions": [
            {
                "id": d.dimension_id,
                "name": d.name,
                "width": d.width,
                "height": d.height,
                "category": d.category,
            }
            for d in dimensions
        ],
        "statuses": CREATIVE_STATUSES,
        "target_audiences": [
            {"id": "general", "name": "General Audience"},
            {"id": "teen", "name": "Teen (13+)"},
            {"id": "adult", "name": "Adult (18+)"},
            {"id": "alcohol", "name": "Alcohol (21+)"},
            {"id": "gambling", "name": "Gambling"},
            {"id": "pharmaceutical", "name": "Pharmaceutical"},
        ]
    }


@router.get("")
async def list_creatives(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all creatives for the current user."""
    query = db.query(Creative).filter(Creative.user_id == current_user.id)
    
    if status:
        query = query.filter(Creative.status == status)
    
    creatives = query.order_by(Creative.created_at.desc()).all()
    
    return {
        "creatives": [creative_to_response(c, db) for c in creatives],
        "counts": {
            "total": len(creatives),
            "draft": sum(1 for c in creatives if c.status == "draft"),
            "pending_review": sum(1 for c in creatives if c.status == "pending_review"),
            "in_review": sum(1 for c in creatives if c.status == "in_review"),
            "approved": sum(1 for c in creatives if c.status == "approved"),
            "rejected": sum(1 for c in creatives if c.status == "rejected"),
            "revision_requested": sum(1 for c in creatives if c.status == "revision_requested"),
        }
    }


@router.get("/approved")
async def get_approved_creatives(
    format_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get approved creatives for use in campaigns."""
    query = db.query(Creative).filter(
        Creative.user_id == current_user.id,
        Creative.status == "approved",
        Creative.is_active == True
    )
    
    if format_type:
        query = query.filter(Creative.format_type == format_type)
    
    creatives = query.order_by(Creative.name).all()
    
    result = []
    for c in creatives:
        format_info = get_format_from_db(db, c.format_type)
        result.append({
            "id": c.id,
            "name": c.name,
            "format_type": c.format_type,
            "format_name": format_info["name"] if format_info else c.format_type,
            "dimensions": c.dimensions,
            "file_url": c.file_url,
            "file_name": c.file_name,
        })
    
    return {"creatives": result}


@router.get("/{creative_id}")
async def get_creative(
    creative_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific creative by ID."""
    creative = db.query(Creative).filter(
        Creative.id == creative_id,
        Creative.user_id == current_user.id
    ).first()
    
    if not creative:
        raise HTTPException(status_code=404, detail="Creative not found")
    
    return creative_to_response(creative, db)


@router.post("")
async def create_creative(
    data: CreativeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new creative."""
    # Validate format type
    if data.format_type not in CREATIVE_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid format type. Must be one of: {list(CREATIVE_FORMATS.keys())}"
        )
    
    # Validate dimensions if provided
    if data.dimensions:
        valid_dims = [d["id"] for d in AD_DIMENSIONS]
        if data.dimensions not in valid_dims:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid dimensions. Must be one of: {valid_dims}"
            )
    
    # Generate mock file URL if file was "uploaded"
    file_url = None
    if data.file_name:
        file_url = generate_mock_file_url(data.format_type, data.dimensions or "default")
    
    creative = Creative(
        user_id=current_user.id,
        name=data.name,
        description=data.description,
        format_type=data.format_type,
        dimensions=data.dimensions,
        file_type=data.file_type,
        file_name=data.file_name,
        file_url=file_url,
        file_size_kb=data.file_size_kb,
        landing_url=data.landing_url,
        alt_text=data.alt_text,
        advertiser_name=data.advertiser_name,
        contains_animation=data.contains_animation,
        contains_audio=data.contains_audio,
        target_audience=data.target_audience,
        tags=json.dumps(data.tags) if data.tags else None,
        status="draft",
        is_active=True,
    )
    
    db.add(creative)
    db.commit()
    db.refresh(creative)
    
    return {
        "message": "Creative created successfully",
        "creative": creative_to_response(creative, db)
    }


@router.put("/{creative_id}")
async def update_creative(
    creative_id: int,
    data: CreativeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update an existing creative."""
    creative = db.query(Creative).filter(
        Creative.id == creative_id,
        Creative.user_id == current_user.id
    ).first()
    
    if not creative:
        raise HTTPException(status_code=404, detail="Creative not found")
    
    # Can't edit approved creatives directly
    if creative.status == "approved":
        raise HTTPException(
            status_code=400,
            detail="Cannot edit approved creatives. Create a new version instead."
        )
    
    # Update fields
    for field in ["name", "description", "format_type", "dimensions", "file_type",
                  "file_name", "file_size_kb", "landing_url", "alt_text",
                  "advertiser_name", "contains_animation", "contains_audio", "target_audience"]:
        value = getattr(data, field, None)
        if value is not None:
            setattr(creative, field, value)
    
    if data.tags is not None:
        creative.tags = json.dumps(data.tags)
    
    # Regenerate file URL if file name changed
    if data.file_name:
        creative.file_url = generate_mock_file_url(
            creative.format_type,
            creative.dimensions or "default"
        )
    
    # Reset status to draft if was rejected/revision requested and now edited
    if creative.status in ["rejected", "revision_requested"]:
        creative.status = "draft"
    
    db.commit()
    db.refresh(creative)
    
    return {
        "message": "Creative updated successfully",
        "creative": creative_to_response(creative, db)
    }


@router.delete("/{creative_id}")
async def delete_creative(
    creative_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a creative."""
    creative = db.query(Creative).filter(
        Creative.id == creative_id,
        Creative.user_id == current_user.id
    ).first()
    
    if not creative:
        raise HTTPException(status_code=404, detail="Creative not found")
    
    db.delete(creative)
    db.commit()
    
    return {"message": "Creative deleted successfully"}


@router.post("/{creative_id}/submit")
async def submit_for_review(
    creative_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Submit a creative for legal/compliance review."""
    creative = db.query(Creative).filter(
        Creative.id == creative_id,
        Creative.user_id == current_user.id
    ).first()
    
    if not creative:
        raise HTTPException(status_code=404, detail="Creative not found")
    
    if creative.status not in ["draft", "revision_requested"]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot submit creative with status '{creative.status}'"
        )
    
    # Validate required fields for submission
    if not creative.file_name:
        raise HTTPException(
            status_code=400,
            detail="Creative must have a file uploaded before submission"
        )
    
    if not creative.landing_url:
        raise HTTPException(
            status_code=400,
            detail="Landing URL is required for submission"
        )
    
    creative.status = "pending_review"
    creative.submitted_at = datetime.utcnow()
    creative.reviewer_notes = None
    creative.rejection_reason = None
    
    db.commit()
    db.refresh(creative)
    
    return {
        "message": "Creative submitted for review",
        "creative": creative_to_response(creative, db)
    }


@router.post("/{creative_id}/review")
async def review_creative(
    creative_id: int,
    action: ReviewAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Review a creative (for demo purposes, anyone can review).
    In production, this would be restricted to legal/compliance team.
    """
    creative = db.query(Creative).filter(
        Creative.id == creative_id,
        Creative.user_id == current_user.id
    ).first()
    
    if not creative:
        raise HTTPException(status_code=404, detail="Creative not found")
    
    if creative.status not in ["pending_review", "in_review"]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot review creative with status '{creative.status}'"
        )
    
    now = datetime.utcnow()
    creative.reviewed_at = now
    creative.reviewer_name = action.reviewer_name
    creative.reviewer_notes = action.notes
    
    if action.action == "approve":
        creative.status = "approved"
    elif action.action == "reject":
        creative.status = "rejected"
        creative.rejection_reason = action.rejection_reason
    elif action.action == "request_revision":
        creative.status = "revision_requested"
    else:
        raise HTTPException(status_code=400, detail="Invalid action")
    
    db.commit()
    db.refresh(creative)
    
    return {
        "message": f"Creative {action.action}ed",
        "creative": creative_to_response(creative, db)
    }


@router.post("/{creative_id}/simulate-review")
async def simulate_review(
    creative_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Simulate a legal review for demo purposes.
    Randomly approves, rejects, or requests revision.
    """
    creative = db.query(Creative).filter(
        Creative.id == creative_id,
        Creative.user_id == current_user.id
    ).first()
    
    if not creative:
        raise HTTPException(status_code=404, detail="Creative not found")
    
    if creative.status != "pending_review":
        raise HTTPException(
            status_code=400,
            detail="Can only simulate review for pending creatives"
        )
    
    # Simulate review delay
    import time
    time.sleep(0.5)
    
    # 70% approve, 15% revision, 15% reject
    rand = random.random()
    now = datetime.utcnow()
    creative.reviewed_at = now
    creative.reviewer_name = "Legal Review Bot"
    
    if rand < 0.70:
        creative.status = "approved"
        creative.reviewer_notes = "Creative meets all brand safety and compliance requirements."
    elif rand < 0.85:
        creative.status = "revision_requested"
        revisions = [
            "Please update the call-to-action to be more specific.",
            "The advertiser logo needs to be more prominent.",
            "Please add a privacy policy link to the landing page.",
            "The font size for disclaimers should be increased.",
        ]
        creative.reviewer_notes = random.choice(revisions)
    else:
        creative.status = "rejected"
        reasons = ["inappropriate_content", "trademark_violation", "misleading_claims", "policy_violation"]
        creative.rejection_reason = random.choice(reasons)
        creative.reviewer_notes = "Creative does not meet brand safety standards. Please review our creative guidelines."
    
    db.commit()
    db.refresh(creative)
    
    return {
        "message": f"Review complete: {creative.status}",
        "creative": creative_to_response(creative, db)
    }

