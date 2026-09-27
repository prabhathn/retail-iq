from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional
from pydantic import BaseModel
import json

from ..database import get_db
from ..models import User, SavedReport
from ..auth import get_current_user

router = APIRouter(prefix="/saved-reports", tags=["Saved Reports"])

class SaveReportRequest(BaseModel):
    report_type: str
    report_name: str
    parameters: dict

class SavedReportResponse(BaseModel):
    id: int
    report_type: str
    report_name: str
    parameters: dict
    created_at: str

@router.get("")
async def get_saved_reports(
    report_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all saved reports for the current user, optionally filtered by report type"""
    
    query = db.query(SavedReport).filter(SavedReport.user_id == current_user.id)
    
    if report_type:
        query = query.filter(SavedReport.report_type == report_type)
    
    saved_reports = query.order_by(desc(SavedReport.created_at)).all()
    
    return {
        "saved_reports": [
            {
                "id": r.id,
                "report_type": r.report_type,
                "report_name": r.report_name,
                "parameters": json.loads(r.parameters) if r.parameters else {},
                "created_at": r.created_at.isoformat() if r.created_at else None
            }
            for r in saved_reports
        ]
    }

@router.post("", status_code=status.HTTP_201_CREATED)
async def save_report(
    request: SaveReportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Save a new report preset"""
    
    # Check if a report with this name already exists for this user and report type
    existing = db.query(SavedReport).filter(
        SavedReport.user_id == current_user.id,
        SavedReport.report_type == request.report_type,
        SavedReport.report_name == request.report_name
    ).first()
    
    if existing:
        # Update existing report
        existing.parameters = json.dumps(request.parameters)
        db.commit()
        db.refresh(existing)
        
        return {
            "id": existing.id,
            "report_type": existing.report_type,
            "report_name": existing.report_name,
            "parameters": json.loads(existing.parameters),
            "created_at": existing.created_at.isoformat() if existing.created_at else None,
            "updated": True
        }
    
    # Create new saved report
    saved_report = SavedReport(
        user_id=current_user.id,
        report_type=request.report_type,
        report_name=request.report_name,
        parameters=json.dumps(request.parameters)
    )
    
    db.add(saved_report)
    db.commit()
    db.refresh(saved_report)
    
    return {
        "id": saved_report.id,
        "report_type": saved_report.report_type,
        "report_name": saved_report.report_name,
        "parameters": json.loads(saved_report.parameters),
        "created_at": saved_report.created_at.isoformat() if saved_report.created_at else None,
        "updated": False
    }

@router.delete("/{report_id}")
async def delete_saved_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a saved report"""
    
    saved_report = db.query(SavedReport).filter(
        SavedReport.id == report_id,
        SavedReport.user_id == current_user.id
    ).first()
    
    if not saved_report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved report not found"
        )
    
    db.delete(saved_report)
    db.commit()
    
    return {"status": "deleted", "id": report_id}

