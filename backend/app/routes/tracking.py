from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
import json

from ..database import get_db
from ..models import ActivityLog, ReportExecution, User
from ..auth import get_current_user

router = APIRouter(prefix="/tracking", tags=["Tracking"])

class ActivityCreate(BaseModel):
    action_type: str
    action_detail: Optional[str] = None
    metadata: Optional[dict] = None
    session_id: Optional[str] = None

class ReportExecutionCreate(BaseModel):
    report_type: str
    report_name: Optional[str] = None
    parameters: dict
    results_summary: Optional[dict] = None
    row_count: Optional[int] = None
    execution_time_ms: Optional[float] = None
    status: str = "success"
    error_message: Optional[str] = None

@router.post("/activity")
async def log_activity(
    activity: ActivityCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Log user activity (page views, clicks, etc.)"""
    
    # Get client info
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent", "")[:500]
    
    log_entry = ActivityLog(
        user_id=current_user.id,
        action_type=activity.action_type,
        action_detail=activity.action_detail,
        extra_data=json.dumps(activity.metadata) if activity.metadata else None,
        ip_address=ip_address,
        user_agent=user_agent,
        session_id=activity.session_id
    )
    
    db.add(log_entry)
    db.commit()
    
    return {"status": "logged", "id": log_entry.id}

@router.post("/report-execution")
async def log_report_execution(
    execution: ReportExecutionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Log a report execution with parameters and results"""
    
    log_entry = ReportExecution(
        user_id=current_user.id,
        report_type=execution.report_type,
        report_name=execution.report_name,
        parameters=json.dumps(execution.parameters),
        results_summary=json.dumps(execution.results_summary) if execution.results_summary else None,
        row_count=execution.row_count,
        execution_time_ms=execution.execution_time_ms,
        status=execution.status,
        error_message=execution.error_message
    )
    
    db.add(log_entry)
    db.commit()
    
    return {"status": "logged", "id": log_entry.id}

# Re-export from utils for backward compatibility
from ..utils import log_report_execution as create_report_execution_log

