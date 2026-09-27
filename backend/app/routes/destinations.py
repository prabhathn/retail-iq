"""
API routes for managing ad network destinations.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import json
from datetime import datetime

from ..database import get_db
from ..models import Destination, User, AdNetwork
from ..auth import get_current_user

router = APIRouter(prefix="/destinations", tags=["destinations"])


def get_network_from_db(db: Session, network_id: str) -> Optional[dict]:
    """Get a network from the database and return as dict."""
    network = db.query(AdNetwork).filter(
        AdNetwork.network_id == network_id,
        AdNetwork.is_active == True
    ).first()
    if not network:
        return None
    return {
        "id": network.network_id,
        "name": network.name,
        "icon": network.icon,
        "category": network.category,
        "credentials": json.loads(network.credentials_schema),
    }


# ============== Pydantic Schemas ==============

class DestinationCreate(BaseModel):
    network_id: str
    name: str
    description: Optional[str] = None
    credentials: Dict[str, str]


class DestinationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    credentials: Optional[Dict[str, str]] = None
    is_active: Optional[bool] = None


class DestinationResponse(BaseModel):
    id: int
    network_id: str
    network_name: str
    network_icon: str
    name: str
    description: Optional[str]
    is_active: bool
    is_verified: bool
    last_synced: Optional[datetime]
    created_at: datetime
    # Don't expose actual credentials, just which fields are set
    credentials_configured: List[str]

    class Config:
        from_attributes = True


# ============== Helper Functions ==============

def mask_credentials(credentials: Dict[str, str]) -> Dict[str, str]:
    """Mask credential values for display (show only last 4 chars)."""
    masked = {}
    for key, value in credentials.items():
        if value and len(value) > 4:
            masked[key] = "•" * 8 + value[-4:]
        elif value:
            masked[key] = "•" * len(value)
        else:
            masked[key] = ""
    return masked


def destination_to_response(dest: Destination, db: Session) -> dict:
    """Convert a Destination model to a response dict."""
    network = get_network_from_db(db, dest.network_id) or {}
    creds = json.loads(dest.credentials) if dest.credentials else {}
    
    return {
        "id": dest.id,
        "network_id": dest.network_id,
        "network_name": network.get("name", dest.network_id),
        "network_icon": network.get("icon", "📡"),
        "name": dest.name,
        "description": dest.description,
        "is_active": dest.is_active,
        "is_verified": dest.is_verified,
        "last_synced": dest.last_synced,
        "created_at": dest.created_at,
        "credentials_configured": list(creds.keys()),
        "credentials_masked": mask_credentials(creds),
    }


# ============== API Routes ==============

@router.get("/networks")
async def get_available_networks(db: Session = Depends(get_db)):
    """Get list of all supported ad networks with their credential requirements."""
    networks = db.query(AdNetwork).filter(
        AdNetwork.is_active == True
    ).order_by(AdNetwork.sort_order, AdNetwork.name).all()
    
    return {
        "networks": [
            {
                "id": n.network_id,
                "name": n.name,
                "icon": n.icon,
                "category": n.category,
                "credentials": json.loads(n.credentials_schema),
            }
            for n in networks
        ]
    }


@router.get("")
async def list_destinations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all destinations for the current user."""
    destinations = db.query(Destination).filter(
        Destination.user_id == current_user.id
    ).order_by(Destination.created_at.desc()).all()
    
    return {
        "destinations": [destination_to_response(d, db) for d in destinations]
    }


@router.get("/{destination_id}")
async def get_destination(
    destination_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific destination by ID."""
    destination = db.query(Destination).filter(
        Destination.id == destination_id,
        Destination.user_id == current_user.id
    ).first()
    
    if not destination:
        raise HTTPException(status_code=404, detail="Destination not found")
    
    return destination_to_response(destination, db)


@router.post("")
async def create_destination(
    data: DestinationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new destination."""
    # Validate network from database
    network = get_network_from_db(db, data.network_id)
    if not network:
        # Get list of valid networks for error message
        valid_networks = [n.network_id for n in db.query(AdNetwork).filter(AdNetwork.is_active == True).all()]
        raise HTTPException(
            status_code=400, 
            detail=f"Unknown network: {data.network_id}. Supported: {valid_networks}"
        )
    
    # Validate required credentials
    for cred in network["credentials"]:
        if cred["required"] and (cred["key"] not in data.credentials or not data.credentials[cred["key"]]):
            raise HTTPException(
                status_code=400,
                detail=f"Missing required credential: {cred['label']}"
            )
    
    # Check for duplicate names
    existing = db.query(Destination).filter(
        Destination.user_id == current_user.id,
        Destination.name == data.name
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"A destination with name '{data.name}' already exists"
        )
    
    # Create destination
    destination = Destination(
        user_id=current_user.id,
        network_id=data.network_id,
        name=data.name,
        description=data.description,
        credentials=json.dumps(data.credentials),
        is_active=True,
        is_verified=False,
    )
    
    db.add(destination)
    db.commit()
    db.refresh(destination)
    
    return {
        "message": "Destination created successfully",
        "destination": destination_to_response(destination, db)
    }


@router.put("/{destination_id}")
async def update_destination(
    destination_id: int,
    data: DestinationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update an existing destination."""
    destination = db.query(Destination).filter(
        Destination.id == destination_id,
        Destination.user_id == current_user.id
    ).first()
    
    if not destination:
        raise HTTPException(status_code=404, detail="Destination not found")
    
    # Update fields
    if data.name is not None:
        # Check for duplicate names
        existing = db.query(Destination).filter(
            Destination.user_id == current_user.id,
            Destination.name == data.name,
            Destination.id != destination_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"A destination with name '{data.name}' already exists"
            )
        destination.name = data.name
    
    if data.description is not None:
        destination.description = data.description
    
    if data.credentials is not None:
        # Merge with existing credentials (allows partial updates)
        existing_creds = json.loads(destination.credentials) if destination.credentials else {}
        existing_creds.update(data.credentials)
        destination.credentials = json.dumps(existing_creds)
        # Reset verification since credentials changed
        destination.is_verified = False
    
    if data.is_active is not None:
        destination.is_active = data.is_active
    
    db.commit()
    db.refresh(destination)
    
    return {
        "message": "Destination updated successfully",
        "destination": destination_to_response(destination, db)
    }


@router.delete("/{destination_id}")
async def delete_destination(
    destination_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a destination."""
    destination = db.query(Destination).filter(
        Destination.id == destination_id,
        Destination.user_id == current_user.id
    ).first()
    
    if not destination:
        raise HTTPException(status_code=404, detail="Destination not found")
    
    db.delete(destination)
    db.commit()
    
    return {"message": "Destination deleted successfully"}


@router.post("/{destination_id}/verify")
async def verify_destination(
    destination_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Test connection to a destination.
    In a real implementation, this would actually call the ad network's API
    to verify the credentials are valid.
    """
    destination = db.query(Destination).filter(
        Destination.id == destination_id,
        Destination.user_id == current_user.id
    ).first()
    
    if not destination:
        raise HTTPException(status_code=404, detail="Destination not found")
    
    # In a real app, this would test the API connection
    # For demo purposes, we'll simulate a successful verification
    import random
    import time
    
    # Simulate API call delay
    time.sleep(0.5)
    
    # 90% chance of success for demo
    success = random.random() < 0.9
    
    if success:
        destination.is_verified = True
        destination.last_synced = datetime.utcnow()
        db.commit()
        db.refresh(destination)
        
        network = get_network_from_db(db, destination.network_id)
        network_name = network["name"] if network else destination.network_id
        
        return {
            "status": "success",
            "message": f"Successfully connected to {network_name}",
            "destination": destination_to_response(destination, db)
        }
    else:
        return {
            "status": "error",
            "message": "Could not verify connection. Please check your credentials and try again."
        }


@router.get("/active/for-campaigns")
async def get_active_destinations_for_campaigns(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get active destinations formatted for campaign creation."""
    destinations = db.query(Destination).filter(
        Destination.user_id == current_user.id,
        Destination.is_active == True
    ).order_by(Destination.network_id).all()
    
    result = []
    for d in destinations:
        network = get_network_from_db(db, d.network_id)
        result.append({
            "id": d.id,
            "network_id": d.network_id,
            "network_name": network["name"] if network else d.network_id,
            "network_icon": network["icon"] if network else "📡",
            "name": d.name,
            "is_verified": d.is_verified,
        })
    
    return {
        "destinations": result,
        "has_destinations": len(result) > 0
    }

