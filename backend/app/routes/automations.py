"""
Automations API routes.

Provides a unified view of all automations across different source objects
(campaigns, standalone automations, and future sources). 

Campaign automations: Source object governs details; this endpoint provides read access and status toggling.
Standalone automations: Created directly in this section with full CRUD support.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime
import json

from ..database import get_db
from ..auth import get_current_user
from ..models import User, Campaign, StandaloneAutomation


router = APIRouter(prefix="/automations", tags=["Automations"])


# ============== Schemas ==============

class AutomationResponse(BaseModel):
    id: str  # Format: "source_type:source_id" e.g., "campaign:123" or "standalone:456"
    source_type: str  # 'campaign', 'standalone', etc.
    source_id: int
    source_name: str  # Name of the source object (e.g., campaign name or automation name)
    source_path: str  # Frontend route to the source object settings
    
    automation_type: str  # 'low_inventory', 'high_inventory_promo', etc.
    automation_type_label: str  # Human-readable label
    description: str
    
    status: str  # 'active', 'paused', 'draft', 'scheduled'
    trigger_count: int
    last_triggered: Optional[datetime]
    
    # Summary of automation config
    config_summary: str  # e.g., "Threshold: 50 units"
    
    created_at: datetime


class AutomationToggleRequest(BaseModel):
    status: str  # 'active' or 'paused'


# Schemas for Standalone Automations CRUD
class ConditionSchema(BaseModel):
    id: str
    object: str
    metric: str
    operator: str
    value: Optional[float | str | bool] = None
    value_type: Optional[str] = None
    time_window_days: Optional[int] = None
    reference_metric: Optional[str] = None


class ActionParameterSchema(BaseModel):
    pass  # Dynamic parameters


class ActionSchema(BaseModel):
    id: str
    object: str
    action: str
    parameters: Optional[dict] = {}


class ScopeFilterSchema(BaseModel):
    type: str  # 'all', 'category', 'brand', 'upc'
    values: Optional[List[str]] = None


class ScopeSchema(BaseModel):
    object: str
    filter: ScopeFilterSchema


class StandaloneAutomationCreate(BaseModel):
    name: str
    description: Optional[str] = None
    status: Optional[str] = "draft"
    scope: Optional[ScopeSchema] = None
    conditions: List[ConditionSchema]
    condition_logic: Optional[str] = "AND"
    actions: List[ActionSchema]


class StandaloneAutomationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    scope: Optional[ScopeSchema] = None
    conditions: Optional[List[ConditionSchema]] = None
    condition_logic: Optional[str] = None
    actions: Optional[List[ActionSchema]] = None


# ============== Automation Type Definitions ==============

AUTOMATION_TYPES = {
    # Campaign-based automation types (legacy)
    'low_inventory': {
        'label': 'Low Inventory Alert',
        'description': 'Triggers when product inventory falls below threshold',
        'icon': 'package',
    },
    'inventory_substitution': {
        'label': 'Auto-Substitute Low Inventory',
        'description': 'Automatically substitute targeted items when forecasted inventory falls below threshold',
        'icon': 'refresh-cw',
    },
    'price_drop': {
        'label': 'Price Drop',
        'description': 'Triggers when competitor price drops',
        'icon': 'trending-down',
    },
    # Standalone automation types (framework-based)
    'high_inventory_promo': {
        'label': 'High Inventory Clearance',
        'description': 'Create promotions when inventory is too high',
        'icon': 'tag',
    },
    'replenishment_reminder': {
        'label': 'Replenishment Reminder',
        'description': 'Promote to shoppers predicted to return soon',
        'icon': 'users',
    },
    'staffing_fulfillment': {
        'label': 'Staffing-Based Fulfillment',
        'description': 'Adjust estimates based on staffing levels',
        'icon': 'building',
    },
    'weather_sponsored': {
        'label': 'Weather-Driven Promotions',
        'description': 'Create campaigns based on weather forecasts',
        'icon': 'cloud',
    },
    'slow_mover_alert': {
        'label': 'Slow Mover Alert',
        'description': 'Pause products with low velocity and alert vendors',
        'icon': 'alert-triangle',
    },
    'custom': {
        'label': 'Custom Automation',
        'description': 'Custom automation with user-defined conditions and actions',
        'icon': 'zap',
    },
}


def format_config_summary(automation_type: str, config: dict) -> str:
    """Format automation config as human-readable summary"""
    if not config:
        return "No configuration"
    
    if automation_type == 'low_inventory':
        threshold = config.get('threshold', 'N/A')
        return f"Threshold: {threshold} units"
    elif automation_type == 'inventory_substitution':
        threshold = config.get('threshold_percent', config.get('threshold', 'N/A'))
        return f"Trigger at {threshold}% inventory"
    elif automation_type == 'price_drop':
        threshold = config.get('price_threshold', 'N/A')
        return f"Price drop: {threshold}%"
    else:
        # Generic fallback - show first config value
        for key, value in config.items():
            return f"{key}: {value}"
        return "Configured"


def format_standalone_summary(automation: StandaloneAutomation) -> str:
    """Format a standalone automation's conditions/actions as a summary"""
    try:
        conditions = json.loads(automation.conditions) if automation.conditions else []
        actions = json.loads(automation.actions) if automation.actions else []
        
        if not conditions and not actions:
            return "No conditions configured"
        
        # Build a simple summary from the first condition
        if conditions:
            cond = conditions[0]
            obj = cond.get('object', 'unknown')
            metric = cond.get('metric', 'unknown').replace('_', ' ')
            operator = cond.get('operator', '').replace('_', ' ')
            value = cond.get('value', '')
            value_type = cond.get('value_type', '')
            
            unit = '%' if value_type == 'percentage' else ''
            summary = f"When {obj} {metric} {operator} {value}{unit}"
            
            if len(conditions) > 1:
                summary += f" (+{len(conditions) - 1} more)"
            
            return summary
        
        return "Configured"
    except:
        return "Configured"


def get_automation_type_from_conditions(conditions: list) -> str:
    """Infer automation type from conditions for labeling"""
    if not conditions:
        return 'custom'
    
    # Check first condition to infer type
    first_cond = conditions[0] if conditions else {}
    obj = first_cond.get('object', '')
    metric = first_cond.get('metric', '')
    
    if obj == 'product' and metric == 'days_on_hand':
        return 'high_inventory_promo'
    elif obj == 'shopper' and metric in ['days_since_purchase', 'purchase_frequency']:
        return 'replenishment_reminder'
    elif obj == 'store' and metric == 'staffing_level':
        return 'staffing_fulfillment'
    elif obj == 'context' and 'weather' in metric:
        return 'weather_sponsored'
    elif obj == 'product' and metric == 'unit_velocity':
        return 'slow_mover_alert'
    
    return 'custom'


def get_automation_label(automation_type: str) -> str:
    """Get human-readable label for automation type"""
    return AUTOMATION_TYPES.get(automation_type, {}).get('label', automation_type)


def get_automation_description(automation_type: str) -> str:
    """Get description for automation type"""
    return AUTOMATION_TYPES.get(automation_type, {}).get('description', '')


# ============== Routes ==============

@router.get("")
async def list_automations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    List all automations from all sources.
    Includes: Campaigns (with automation enabled), Standalone Automations
    
    Campaign automations are only shown if:
    - "active" (live campaigns) -> shows as "running" or "paused"
    - "scheduled" (upcoming campaigns) -> shows as "scheduled"
    
    Standalone automations are shown regardless of status.
    """
    automations = []
    
    # 1. Get campaign automations - only for active or scheduled campaigns
    campaigns_with_automation = db.query(Campaign).filter(
        Campaign.user_id == current_user.id,
        Campaign.automation_enabled == True,
        Campaign.status.in_(['active', 'scheduled'])  # Only show active or scheduled campaigns
    ).order_by(desc(Campaign.created_at)).all()
    
    for campaign in campaigns_with_automation:
        config = {}
        if campaign.automation_config:
            try:
                config = json.loads(campaign.automation_config)
            except:
                pass
        
        # Determine automation status based on campaign status
        if campaign.status == 'scheduled':
            automation_display_status = 'scheduled'
        elif campaign.status == 'active':
            automation_display_status = 'running' if campaign.automation_status == 'active' else 'paused'
        else:
            automation_display_status = 'paused'
        
        automations.append({
            "id": f"campaign:{campaign.id}",
            "source_type": "campaign",
            "source_id": campaign.id,
            "source_name": campaign.name,
            "source_path": f"/activation/campaigns?edit={campaign.id}",
            "automation_type": campaign.automation_type or "unknown",
            "automation_type_label": get_automation_label(campaign.automation_type),
            "description": get_automation_description(campaign.automation_type),
            "status": automation_display_status,
            "campaign_status": campaign.status,
            "trigger_count": campaign.automation_trigger_count or 0,
            "last_triggered": campaign.automation_last_triggered,
            "config_summary": format_config_summary(campaign.automation_type, config),
            "created_at": campaign.created_at,
        })
    
    # 2. Get standalone automations
    standalone_automations = db.query(StandaloneAutomation).filter(
        StandaloneAutomation.user_id == current_user.id
    ).order_by(desc(StandaloneAutomation.created_at)).all()
    
    for auto in standalone_automations:
        # Parse conditions to infer type
        conditions = []
        try:
            conditions = json.loads(auto.conditions) if auto.conditions else []
        except:
            pass
        
        automation_type = get_automation_type_from_conditions(conditions)
        
        # Map status to display status
        if auto.status == 'active':
            display_status = 'running'
        elif auto.status == 'paused':
            display_status = 'paused'
        else:
            display_status = 'draft'
        
        automations.append({
            "id": f"standalone:{auto.id}",
            "source_type": "standalone",
            "source_id": auto.id,
            "source_name": auto.name,
            "source_path": f"/automations?edit={auto.id}",
            "automation_type": automation_type,
            "automation_type_label": get_automation_label(automation_type),
            "description": auto.description or get_automation_description(automation_type),
            "status": display_status,
            "trigger_count": auto.trigger_count or 0,
            "last_triggered": auto.last_triggered,
            "config_summary": format_standalone_summary(auto),
            "created_at": auto.created_at,
        })
    
    # Sort all automations by created_at descending
    automations.sort(key=lambda x: x['created_at'], reverse=True)
    
    return {
        "automations": automations,
        "total": len(automations),
    }


@router.get("/standalone/{automation_id}")
async def get_standalone_automation(
    automation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a single standalone automation with full details"""
    automation = db.query(StandaloneAutomation).filter(
        StandaloneAutomation.id == automation_id,
        StandaloneAutomation.user_id == current_user.id
    ).first()
    
    if not automation:
        raise HTTPException(status_code=404, detail="Automation not found")
    
    # Parse JSON fields
    scope = None
    conditions = []
    actions = []
    
    try:
        if automation.scope:
            scope = json.loads(automation.scope)
        if automation.conditions:
            conditions = json.loads(automation.conditions)
        if automation.actions:
            actions = json.loads(automation.actions)
    except:
        pass
    
    return {
        "id": automation.id,
        "name": automation.name,
        "description": automation.description,
        "status": automation.status,
        "scope": scope,
        "conditions": conditions,
        "condition_logic": automation.condition_logic,
        "actions": actions,
        "trigger_count": automation.trigger_count,
        "last_triggered": automation.last_triggered,
        "created_at": automation.created_at,
        "updated_at": automation.updated_at,
    }


@router.post("/standalone")
async def create_standalone_automation(
    data: StandaloneAutomationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new standalone automation"""
    
    # Serialize JSON fields
    scope_json = json.dumps(data.scope.dict()) if data.scope else None
    conditions_json = json.dumps([c.dict() for c in data.conditions])
    actions_json = json.dumps([a.dict() for a in data.actions])
    
    automation = StandaloneAutomation(
        user_id=current_user.id,
        name=data.name,
        description=data.description,
        status=data.status or "draft",
        scope=scope_json,
        conditions=conditions_json,
        condition_logic=data.condition_logic or "AND",
        actions=actions_json,
    )
    
    db.add(automation)
    db.commit()
    db.refresh(automation)
    
    return {
        "id": automation.id,
        "message": "Automation created successfully",
        "automation": {
            "id": automation.id,
            "name": automation.name,
            "status": automation.status,
            "created_at": automation.created_at,
        }
    }


@router.put("/standalone/{automation_id}")
async def update_standalone_automation(
    automation_id: int,
    data: StandaloneAutomationUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update an existing standalone automation"""
    automation = db.query(StandaloneAutomation).filter(
        StandaloneAutomation.id == automation_id,
        StandaloneAutomation.user_id == current_user.id
    ).first()
    
    if not automation:
        raise HTTPException(status_code=404, detail="Automation not found")
    
    # Update fields if provided
    if data.name is not None:
        automation.name = data.name
    if data.description is not None:
        automation.description = data.description
    if data.status is not None:
        automation.status = data.status
    if data.scope is not None:
        automation.scope = json.dumps(data.scope.dict())
    if data.conditions is not None:
        automation.conditions = json.dumps([c.dict() for c in data.conditions])
    if data.condition_logic is not None:
        automation.condition_logic = data.condition_logic
    if data.actions is not None:
        automation.actions = json.dumps([a.dict() for a in data.actions])
    
    db.commit()
    db.refresh(automation)
    
    return {
        "id": automation.id,
        "message": "Automation updated successfully",
        "automation": {
            "id": automation.id,
            "name": automation.name,
            "status": automation.status,
            "updated_at": automation.updated_at,
        }
    }


@router.delete("/standalone/{automation_id}")
async def delete_standalone_automation(
    automation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a standalone automation"""
    automation = db.query(StandaloneAutomation).filter(
        StandaloneAutomation.id == automation_id,
        StandaloneAutomation.user_id == current_user.id
    ).first()
    
    if not automation:
        raise HTTPException(status_code=404, detail="Automation not found")
    
    db.delete(automation)
    db.commit()
    
    return {
        "message": "Automation deleted successfully",
        "id": automation_id,
    }


@router.patch("/{automation_id}/status")
async def toggle_automation_status(
    automation_id: str,
    request: AutomationToggleRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Toggle automation status (active/paused).
    automation_id format: "source_type:source_id" e.g., "campaign:123" or "standalone:456"
    """
    if request.status not in ['active', 'paused']:
        raise HTTPException(status_code=400, detail="Status must be 'active' or 'paused'")
    
    # Parse automation ID
    try:
        source_type, source_id = automation_id.split(":")
        source_id = int(source_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid automation ID format")
    
    if source_type == "campaign":
        campaign = db.query(Campaign).filter(
            Campaign.id == source_id,
            Campaign.user_id == current_user.id,
            Campaign.automation_enabled == True
        ).first()
        
        if not campaign:
            raise HTTPException(status_code=404, detail="Automation not found")
        
        campaign.automation_status = request.status
        db.commit()
        
        return {
            "id": automation_id,
            "status": request.status,
            "message": f"Automation {'activated' if request.status == 'active' else 'paused'}"
        }
    
    elif source_type == "standalone":
        automation = db.query(StandaloneAutomation).filter(
            StandaloneAutomation.id == source_id,
            StandaloneAutomation.user_id == current_user.id
        ).first()
        
        if not automation:
            raise HTTPException(status_code=404, detail="Automation not found")
        
        automation.status = request.status
        db.commit()
        
        return {
            "id": automation_id,
            "status": request.status,
            "message": f"Automation {'activated' if request.status == 'active' else 'paused'}"
        }
    
    else:
        raise HTTPException(status_code=400, detail=f"Unknown source type: {source_type}")


@router.get("/types")
async def get_automation_types(
    current_user: User = Depends(get_current_user)
):
    """Get available automation types and their metadata"""
    return {
        "types": [
            {
                "id": type_id,
                "label": info["label"],
                "description": info["description"],
                "icon": info["icon"],
            }
            for type_id, info in AUTOMATION_TYPES.items()
        ]
    }


@router.get("/templates")
async def get_automation_templates(
    current_user: User = Depends(get_current_user)
):
    """Get pre-built automation templates that users can start from"""
    templates = [
        {
            "id": "high_inventory_promo",
            "name": "High Inventory Clearance",
            "description": "When product inventory exceeds 70% of days-on-hand threshold, automatically create a 15% discount promotion for 7 days to clear excess stock and reduce carrying costs.",
            "category": "inventory",
            "scope": {"object": "product", "filter": {"type": "all"}},
            "conditions": [
                {"id": "cond_1", "object": "product", "metric": "days_on_hand", "operator": "greater_than", "value": 70, "value_type": "percentage"}
            ],
            "condition_logic": "AND",
            "actions": [
                {"id": "act_1", "object": "promotion", "action": "create", "parameters": {"discount_percent": 15, "duration_days": 7, "promotion_type": "markdown"}}
            ]
        },
        {
            "id": "replenishment_reminder",
            "name": "Replenishment Reminder",
            "description": "When a shopper is within 3 days of their typical repurchase cycle for a product, send them a personalized promotion to encourage the repeat purchase and maintain loyalty.",
            "category": "shopper",
            "scope": None,
            "conditions": [
                {"id": "cond_1", "object": "shopper", "metric": "days_since_purchase", "operator": "within_of", "value": 3, "reference_metric": "purchase_frequency"}
            ],
            "condition_logic": "AND",
            "actions": [
                {"id": "act_1", "object": "shopper", "action": "send_promotion", "parameters": {"discount_percent": 10, "channel": "email"}}
            ]
        },
        {
            "id": "staffing_fulfillment",
            "name": "Staffing-Based Fulfillment Adjustment",
            "description": "When store staffing levels fall below 60% of optimal, automatically increase pickup and delivery time estimates to set accurate customer expectations and prevent service failures.",
            "category": "operations",
            "scope": {"object": "store", "filter": {"type": "all"}},
            "conditions": [
                {"id": "cond_1", "object": "store", "metric": "staffing_level", "operator": "less_than", "value": 60, "value_type": "percentage"}
            ],
            "condition_logic": "AND",
            "actions": [
                {"id": "act_1", "object": "store", "action": "adjust_pickup_estimate", "parameters": {"add_minutes": 15}},
                {"id": "act_2", "object": "store", "action": "adjust_delivery_estimate", "parameters": {"add_minutes": 20}}
            ]
        },
        {
            "id": "weather_sponsored",
            "name": "Weather-Driven Promotions",
            "description": "When tomorrow's weather forecast predicts rain, automatically create sponsored listing campaigns for weather-relevant products like umbrellas, rain gear, and boots to capture increased demand.",
            "category": "marketing",
            "scope": {"object": "product", "filter": {"type": "category", "values": ["Umbrellas", "Rain Gear", "Boots", "Raincoats"]}},
            "conditions": [
                {"id": "cond_1", "object": "context", "metric": "weather_forecast_tomorrow", "operator": "equals", "value": "Rain"}
            ],
            "condition_logic": "AND",
            "actions": [
                {"id": "act_1", "object": "campaign", "action": "create_sponsored_listing", "parameters": {"budget": 500, "duration_days": 2}}
            ]
        },
        {
            "id": "slow_mover_alert",
            "name": "Slow Mover Alert",
            "description": "When a product's unit velocity falls below 5 units per week over the past 30 days, pause the product from active sales and send an alert to the vendor for possible delistment or promotional support.",
            "category": "inventory",
            "scope": {"object": "product", "filter": {"type": "all"}},
            "conditions": [
                {"id": "cond_1", "object": "product", "metric": "unit_velocity", "operator": "less_than", "value": 5, "time_window_days": 30}
            ],
            "condition_logic": "AND",
            "actions": [
                {"id": "act_1", "object": "product", "action": "pause_sales", "parameters": {}},
                {"id": "act_2", "object": "notification", "action": "send_alert", "parameters": {"recipient_type": "vendor", "template": "low_velocity_alert", "include_product_details": True}}
            ]
        },
    ]
    
    return {"templates": templates}
