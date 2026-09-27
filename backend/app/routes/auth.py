from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Dict, Any

from ..database import get_db
from ..models import User, ModuleAccess, GlobalModuleSettings, AVAILABLE_MODULES
from ..schemas import UserCreate, UserLogin, Token, UserResponse
from ..auth import get_password_hash, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", response_model=Token)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    # Check if user exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        email=user_data.email,
        hashed_password=hashed_password,
        full_name=user_data.full_name,
        company=user_data.company
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Create access token
    access_token = create_access_token(data={"sub": new_user.email})
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(new_user)
    )

@router.post("/login", response_model=Token)
async def login(credentials: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    # Update last login
    user.last_login = datetime.utcnow()
    db.commit()
    
    # Create access token
    access_token = create_access_token(data={"sub": user.email})
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)


@router.get("/me/modules")
async def get_my_modules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get the current user's module access permissions and global module settings.
    
    Returns:
    - access: dict mapping module_key to has_access boolean (user-level permissions)
    - global_settings: dict mapping module_key to {is_enabled, disabled_reason} (global settings)
    
    A module is accessible if:
    1. It is globally enabled (is_enabled = True or no setting exists)
    2. AND the user has access (has_access = True)
    """
    # Get user's module access entries
    access_entries = db.query(ModuleAccess).filter(
        ModuleAccess.user_id == current_user.id
    ).all()
    
    # Get global module settings
    global_settings_entries = db.query(GlobalModuleSettings).all()
    global_settings = {
        entry.module_key: {
            "is_enabled": entry.is_enabled,
            "disabled_reason": entry.disabled_reason,
        }
        for entry in global_settings_entries
    }
    
    # Build user access dict
    if access_entries:
        user_access = {entry.module_key: entry.has_access for entry in access_entries}
    else:
        # No entries exist - check if admin (give full access) or regular user (no access)
        is_admin = current_user.role == "admin"
        user_access = {module["key"]: is_admin for module in AVAILABLE_MODULES}
    
    # For backward compatibility, also return a flat dict where access is determined by both user and global
    # This is what the frontend currently expects
    combined_access = {}
    for module in AVAILABLE_MODULES:
        key = module["key"]
        # User has access if they have permission AND the module is globally enabled
        user_has_access = user_access.get(key, False)
        globally_enabled = global_settings.get(key, {}).get("is_enabled", True)  # Default to enabled
        combined_access[key] = user_has_access and globally_enabled
    
    return combined_access


@router.get("/me/modules/detailed")
async def get_my_modules_detailed(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get detailed module access info including global settings.
    
    Returns separate user_access and global_settings for the frontend to handle.
    """
    # Get user's module access entries
    access_entries = db.query(ModuleAccess).filter(
        ModuleAccess.user_id == current_user.id
    ).all()
    
    # Get global module settings
    global_settings_entries = db.query(GlobalModuleSettings).all()
    global_settings = {
        entry.module_key: {
            "is_enabled": entry.is_enabled,
            "disabled_reason": entry.disabled_reason,
        }
        for entry in global_settings_entries
    }
    
    # Build user access dict
    if access_entries:
        user_access = {entry.module_key: entry.has_access for entry in access_entries}
    else:
        is_admin = current_user.role == "admin"
        user_access = {module["key"]: is_admin for module in AVAILABLE_MODULES}
    
    return {
        "user_access": user_access,
        "global_settings": global_settings,
    }


@router.get("/modules/available")
async def get_available_modules(current_user: User = Depends(get_current_user)):
    """Get the list of all available modules in the system."""
    return AVAILABLE_MODULES

