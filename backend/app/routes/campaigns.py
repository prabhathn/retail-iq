"""
Campaign management API routes.

Supports four campaign types:
1. Price Promotion - Discount on UPCs
2. Sponsored Listing - Product placement in search results
3. Display Ad (Onsite) - Banner ads on ecommerce site
4. Display Ad (Offsite) - Ads on external networks (Facebook, Trade Desk)
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime
import json
import os

from ..database import get_db
from ..auth import get_current_user
from ..models import User, Campaign, ShopperCohort


router = APIRouter(prefix="/campaigns", tags=["Campaigns"])


# ============== Schemas ==============

class CampaignBase(BaseModel):
    name: str
    description: Optional[str] = None
    campaign_type: str  # 'price_promotion', 'sponsored_listing', 'display_ad_onsite', 'display_ad_offsite'
    start_date: datetime
    end_date: datetime
    target_type: Optional[str] = None  # 'upc', 'brand', 'category'
    target_upc: Optional[str] = None
    target_brand: Optional[str] = None
    target_category: Optional[str] = None
    cohort_id: Optional[int] = None
    configuration: Optional[dict] = None
    # Automation fields
    automation_enabled: Optional[bool] = False
    automation_type: Optional[str] = None  # 'low_inventory', 'inventory_substitution', etc.
    automation_config: Optional[dict] = None  # {"threshold": 50}


class CampaignCreate(CampaignBase):
    pass


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: Optional[str] = None
    target_type: Optional[str] = None
    target_upc: Optional[str] = None
    target_brand: Optional[str] = None
    target_category: Optional[str] = None
    cohort_id: Optional[int] = None
    configuration: Optional[dict] = None
    # Automation fields
    automation_enabled: Optional[bool] = None
    automation_type: Optional[str] = None
    automation_config: Optional[dict] = None
    automation_status: Optional[str] = None  # 'active', 'paused'


class CampaignResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    campaign_type: str
    status: str
    start_date: datetime
    end_date: datetime
    target_type: Optional[str]
    target_upc: Optional[str]
    target_brand: Optional[str]
    target_category: Optional[str]
    cohort_id: Optional[int]
    cohort_name: Optional[str] = None
    configuration: Optional[dict]
    impressions: int
    clicks: int
    conversions: int
    spend: float
    # Automation fields
    automation_enabled: bool = False
    automation_type: Optional[str] = None
    automation_config: Optional[dict] = None
    automation_status: Optional[str] = None
    automation_trigger_count: int = 0
    automation_last_triggered: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime]
    
    class Config:
        from_attributes = True


# ============== Helper Functions ==============

def campaign_to_response(campaign: Campaign, cohort_name: str = None) -> dict:
    """Convert a Campaign model to a response dict"""
    config = None
    if campaign.configuration:
        try:
            config = json.loads(campaign.configuration)
        except:
            config = None
    
    automation_config = None
    if campaign.automation_config:
        try:
            automation_config = json.loads(campaign.automation_config)
        except:
            automation_config = None
    
    return {
        "id": campaign.id,
        "name": campaign.name,
        "description": campaign.description,
        "campaign_type": campaign.campaign_type,
        "status": campaign.status,
        "start_date": campaign.start_date,
        "end_date": campaign.end_date,
        "target_type": campaign.target_type,
        "target_upc": campaign.target_upc,
        "target_brand": campaign.target_brand,
        "target_category": campaign.target_category,
        "cohort_id": campaign.cohort_id,
        "cohort_name": cohort_name,
        "configuration": config,
        "impressions": campaign.impressions or 0,
        "clicks": campaign.clicks or 0,
        "conversions": campaign.conversions or 0,
        "spend": campaign.spend or 0.0,
        # Automation fields
        "automation_enabled": campaign.automation_enabled or False,
        "automation_type": campaign.automation_type,
        "automation_config": automation_config,
        "automation_status": campaign.automation_status,
        "automation_trigger_count": campaign.automation_trigger_count or 0,
        "automation_last_triggered": campaign.automation_last_triggered,
        "created_at": campaign.created_at,
        "updated_at": campaign.updated_at,
    }


# ============== Campaign Type Definitions ==============

CAMPAIGN_TYPES = {
    "price_promotion": {
        "label": "Price Promotion",
        "description": "Discount on specific products",
        "requires_product": True,
        "supports_cohort": True,
        "config_fields": ["discount_type", "discount_value"]
    },
    "sponsored_listing": {
        "label": "Sponsored Listing",
        "description": "Product placement in search results",
        "requires_product": True,
        "supports_cohort": False,
        "config_fields": ["keywords"]
    },
    "display_ad_onsite": {
        "label": "Display Ad (Onsite)",
        "description": "Banner ads on the ecommerce site",
        "requires_product": False,
        "supports_cohort": True,
        "config_fields": ["keywords", "creative_url", "creative_filename"]
    },
    "display_ad_offsite": {
        "label": "Display Ad (Offsite)",
        "description": "Ads on external networks",
        "requires_product": False,
        "supports_cohort": True,
        "config_fields": ["ad_networks", "creative_url", "creative_filename"]
    }
}

AD_NETWORKS = [
    {"id": "facebook", "name": "Facebook/Meta Ads"},
    {"id": "trade_desk", "name": "The Trade Desk"},
    {"id": "google_display", "name": "Google Display Network"},
    {"id": "amazon_dsp", "name": "Amazon DSP"},
    {"id": "criteo", "name": "Criteo"},
    {"id": "liveramp", "name": "LiveRamp"},
]


# ============== Endpoints ==============

@router.get("/types")
async def get_campaign_types(current_user: User = Depends(get_current_user)):
    """Get available campaign types and their configurations"""
    return {
        "campaign_types": CAMPAIGN_TYPES,
        "ad_networks": AD_NETWORKS
    }


@router.get("")
async def list_campaigns(
    status: Optional[str] = None,
    campaign_type: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all campaigns for the current user"""
    query = db.query(Campaign).filter(Campaign.user_id == current_user.id)
    
    if status:
        query = query.filter(Campaign.status == status)
    if campaign_type:
        query = query.filter(Campaign.campaign_type == campaign_type)
    
    total = query.count()
    campaigns = query.order_by(desc(Campaign.created_at)).offset(offset).limit(limit).all()
    
    # Get cohort names
    cohort_ids = [c.cohort_id for c in campaigns if c.cohort_id]
    cohorts = {}
    if cohort_ids:
        cohort_records = db.query(ShopperCohort).filter(ShopperCohort.id.in_(cohort_ids)).all()
        cohorts = {c.id: c.name for c in cohort_records}
    
    return {
        "campaigns": [
            campaign_to_response(c, cohorts.get(c.cohort_id))
            for c in campaigns
        ],
        "total": total,
        "limit": limit,
        "offset": offset
    }


@router.post("")
async def create_campaign(
    campaign: CampaignCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new campaign"""
    # Validate campaign type
    if campaign.campaign_type not in CAMPAIGN_TYPES:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid campaign type. Must be one of: {list(CAMPAIGN_TYPES.keys())}"
        )
    
    # Validate cohort if specified
    cohort_name = None
    if campaign.cohort_id:
        cohort = db.query(ShopperCohort).filter(
            ShopperCohort.id == campaign.cohort_id,
            ShopperCohort.user_id == current_user.id,
            ShopperCohort.is_active == True
        ).first()
        if not cohort:
            raise HTTPException(status_code=404, detail="Cohort not found")
        cohort_name = cohort.name
    
    # Create campaign
    new_campaign = Campaign(
        user_id=current_user.id,
        name=campaign.name,
        description=campaign.description,
        campaign_type=campaign.campaign_type,
        status="draft",
        start_date=campaign.start_date,
        end_date=campaign.end_date,
        target_type=campaign.target_type,
        target_upc=campaign.target_upc,
        target_brand=campaign.target_brand,
        target_category=campaign.target_category,
        cohort_id=campaign.cohort_id,
        configuration=json.dumps(campaign.configuration) if campaign.configuration else None,
        # Automation fields
        automation_enabled=campaign.automation_enabled or False,
        automation_type=campaign.automation_type,
        automation_config=json.dumps(campaign.automation_config) if campaign.automation_config else None,
        automation_status="paused" if campaign.automation_enabled else None,
    )
    
    db.add(new_campaign)
    db.commit()
    db.refresh(new_campaign)
    
    return campaign_to_response(new_campaign, cohort_name)


@router.get("/{campaign_id}")
async def get_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific campaign"""
    campaign = db.query(Campaign).filter(
        Campaign.id == campaign_id,
        Campaign.user_id == current_user.id
    ).first()
    
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    cohort_name = None
    if campaign.cohort_id:
        cohort = db.query(ShopperCohort).filter(ShopperCohort.id == campaign.cohort_id).first()
        if cohort:
            cohort_name = cohort.name
    
    return campaign_to_response(campaign, cohort_name)


@router.put("/{campaign_id}")
async def update_campaign(
    campaign_id: int,
    update: CampaignUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a campaign"""
    campaign = db.query(Campaign).filter(
        Campaign.id == campaign_id,
        Campaign.user_id == current_user.id
    ).first()
    
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Update fields
    update_data = update.dict(exclude_unset=True)
    
    if "configuration" in update_data and update_data["configuration"] is not None:
        update_data["configuration"] = json.dumps(update_data["configuration"])
    
    if "automation_config" in update_data and update_data["automation_config"] is not None:
        update_data["automation_config"] = json.dumps(update_data["automation_config"])
    
    # Validate cohort if changing
    cohort_name = None
    if "cohort_id" in update_data and update_data["cohort_id"]:
        cohort = db.query(ShopperCohort).filter(
            ShopperCohort.id == update_data["cohort_id"],
            ShopperCohort.user_id == current_user.id,
            ShopperCohort.is_active == True
        ).first()
        if not cohort:
            raise HTTPException(status_code=404, detail="Cohort not found")
        cohort_name = cohort.name
    elif campaign.cohort_id:
        cohort = db.query(ShopperCohort).filter(ShopperCohort.id == campaign.cohort_id).first()
        if cohort:
            cohort_name = cohort.name
    
    for field, value in update_data.items():
        setattr(campaign, field, value)
    
    db.commit()
    db.refresh(campaign)
    
    return campaign_to_response(campaign, cohort_name)


@router.delete("/{campaign_id}")
async def delete_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a campaign"""
    campaign = db.query(Campaign).filter(
        Campaign.id == campaign_id,
        Campaign.user_id == current_user.id
    ).first()
    
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    db.delete(campaign)
    db.commit()
    
    return {"status": "deleted", "id": campaign_id}


@router.post("/{campaign_id}/status")
async def update_campaign_status(
    campaign_id: int,
    status: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update campaign status (schedule, activate, pause, complete)"""
    valid_statuses = ["draft", "scheduled", "active", "paused", "completed"]
    if status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {valid_statuses}"
        )
    
    campaign = db.query(Campaign).filter(
        Campaign.id == campaign_id,
        Campaign.user_id == current_user.id
    ).first()
    
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    campaign.status = status
    db.commit()
    db.refresh(campaign)
    
    return {"status": "updated", "campaign_id": campaign_id, "new_status": status}


@router.post("/{campaign_id}/duplicate")
async def duplicate_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Duplicate an existing campaign"""
    campaign = db.query(Campaign).filter(
        Campaign.id == campaign_id,
        Campaign.user_id == current_user.id
    ).first()
    
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Create new campaign with same settings
    new_campaign = Campaign(
        user_id=current_user.id,
        name=f"{campaign.name} (Copy)",
        description=campaign.description,
        campaign_type=campaign.campaign_type,
        status="draft",
        start_date=campaign.start_date,
        end_date=campaign.end_date,
        target_type=campaign.target_type,
        target_upc=campaign.target_upc,
        target_brand=campaign.target_brand,
        target_category=campaign.target_category,
        cohort_id=campaign.cohort_id,
        configuration=campaign.configuration
    )
    
    db.add(new_campaign)
    db.commit()
    db.refresh(new_campaign)
    
    cohort_name = None
    if new_campaign.cohort_id:
        cohort = db.query(ShopperCohort).filter(ShopperCohort.id == new_campaign.cohort_id).first()
        if cohort:
            cohort_name = cohort.name
    
    return campaign_to_response(new_campaign, cohort_name)


# Mock creative upload endpoint (non-functional, just returns success)
@router.post("/{campaign_id}/creative")
async def upload_creative(
    campaign_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Mock creative upload endpoint.
    In a real implementation, this would handle file uploads to S3/cloud storage.
    For now, it just simulates a successful upload.
    """
    campaign = db.query(Campaign).filter(
        Campaign.id == campaign_id,
        Campaign.user_id == current_user.id
    ).first()
    
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Simulate successful upload
    mock_url = f"https://cdn.retailiq.com/creatives/{campaign_id}/banner_{campaign_id}.jpg"
    
    # Update campaign configuration with mock URL
    config = json.loads(campaign.configuration) if campaign.configuration else {}
    config["creative_url"] = mock_url
    config["creative_filename"] = f"banner_{campaign_id}.jpg"
    campaign.configuration = json.dumps(config)
    
    db.commit()
    
    return {
        "status": "uploaded",
        "creative_url": mock_url,
        "filename": f"banner_{campaign_id}.jpg",
        "message": "Creative uploaded successfully (mock)"
    }

