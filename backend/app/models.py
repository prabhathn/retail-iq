from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, Float, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from .database import Base

class Scope(Base):
    """Permission scopes that define data access levels"""
    __tablename__ = "scopes"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    # Stable machine key for the scope, e.g. 'ADMIN', 'DAIRY_MANAGER'. The table
    # column was previously only created by the raw ALTER TABLE migration in
    # scripts/init_postgres.py and was never declared here, so seeding scopes
    # raised "'scope_key' is an invalid keyword argument for Scope".
    scope_key = Column(String(50), unique=True)
    role_name = Column(String(100), unique=True)  # 'RETAILIQ_ROLE_ADMIN', 'RETAILIQ_ROLE_DAIRY_MANAGER' - Snowflake role for RBAC
    description = Column(Text)
    is_admin = Column(Boolean, default=False)  # Admin scopes bypass row filtering
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    entitlements = relationship("ScopeEntitlement", back_populates="scope")
    users = relationship("User", back_populates="scope")

class ScopeEntitlement(Base):
    """What each scope is entitled to access"""
    __tablename__ = "scope_entitlements"
    
    id = Column(Integer, primary_key=True, index=True)
    scope_id = Column(Integer, ForeignKey("scopes.id"), nullable=False)
    tenant_type = Column(String(50), nullable=False)  # 'category', 'brand', 'all'
    tenant_id = Column(String(255))  # 'Dairy', 'Kraft', NULL for 'all'
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationship
    scope = relationship("Scope", back_populates="entitlements")

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    company = Column(String(255))
    role = Column(String(50), default="analyst")  # analyst, admin
    is_active = Column(Boolean, default=True)
    password_reset_required = Column(Boolean, default=False)  # Force password reset on next login
    scope_id = Column(Integer, ForeignKey("scopes.id"))  # Link to permission scope
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login = Column(DateTime(timezone=True))
    
    # Relationships
    activities = relationship("ActivityLog", back_populates="user")
    report_executions = relationship("ReportExecution", back_populates="user")
    scope = relationship("Scope", back_populates="users")
    module_access = relationship("ModuleAccess", back_populates="user")

class SavedReport(Base):
    __tablename__ = "saved_reports"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    report_type = Column(String(100), nullable=False)
    report_name = Column(String(255), nullable=False)
    parameters = Column(Text)  # JSON string of report parameters
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ActivityLog(Base):
    """Track user navigation and actions"""
    __tablename__ = "activity_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action_type = Column(String(50), nullable=False)  # page_view, button_click, report_run, login, logout
    action_detail = Column(String(255))  # e.g., page path, button name
    extra_data = Column(Text)  # JSON string for additional data
    ip_address = Column(String(50))
    user_agent = Column(String(500))
    session_id = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationship
    user = relationship("User", back_populates="activities")

class ReportExecution(Base):
    """Store every report that was run with parameters and results"""
    __tablename__ = "report_executions"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    report_type = Column(String(100), nullable=False)  # category_sales, market_basket, shopper_cohorts, store_performance
    report_name = Column(String(255))  # Human readable name
    parameters = Column(Text, nullable=False)  # JSON string of input parameters
    results_summary = Column(Text)  # JSON string of summary/aggregated results
    row_count = Column(Integer)  # Number of result rows
    execution_time_ms = Column(Float)  # How long the query took
    status = Column(String(20), default="success")  # success, error
    error_message = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationship
    user = relationship("User", back_populates="report_executions")

class ShopperCohort(Base):
    """Store shopper cohort definitions and metadata"""
    __tablename__ = "shopper_cohorts"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    cohort_type = Column(String(50), nullable=False)  # 'custom' for defined cohorts, 'segment' for segmentation-based
    definition = Column(Text, nullable=False)  # JSON string of cohort definition/conditions
    shopper_count = Column(Integer)  # Number of shoppers in cohort
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationship
    user = relationship("User")


class ModuleAccess(Base):
    """Define which modules/reports each user can access"""
    __tablename__ = "module_access"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    module_key = Column(String(100), nullable=False)  # e.g., 'dashboard', 'insights.sales_analytics'
    has_access = Column(Boolean, default=True)  # True = can access, False = greyed out
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationship
    user = relationship("User", back_populates="module_access")


class GlobalModuleSettings(Base):
    """
    Global settings for modules - applies to ALL users regardless of individual permissions.
    
    Use cases:
    - Disable a module temporarily for maintenance/updates
    - Disable a module when required datasets are not connected
    - Mark modules as coming soon / beta
    
    User-level permissions (ModuleAccess) are preserved when a module is globally disabled,
    so when re-enabled, all user access is automatically restored.
    """
    __tablename__ = "global_module_settings"
    
    module_key = Column(String(100), primary_key=True)  # e.g., 'operations.fulfillment'
    is_enabled = Column(Boolean, default=True)  # False = disabled for ALL users
    disabled_reason = Column(String(255))  # "Under maintenance", "Dataset not connected", "Coming soon"
    disabled_at = Column(DateTime(timezone=True))
    disabled_by_id = Column(Integer, ForeignKey("users.id"))
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationship
    disabled_by = relationship("User")


class DataGenerationJob(Base):
    """
    Tracks an admin-initiated synthetic data top-up.

    The top-up appends days of transactions from MAX(transaction_date) up to a
    target date, which for the full dataset means tens of thousands of rows and a
    multi-minute run. That is far too long for a request/response cycle, so the
    work runs as a background task and the admin UI polls this row for progress.

    Concurrency: only one job may be 'running' at a time. Two simultaneous
    appenders would each read the same MAX(transaction_id) and generate colliding
    primary keys, so the launch endpoint rejects a second request rather than
    queueing it.
    """
    __tablename__ = "data_generation_jobs"

    id = Column(Integer, primary_key=True, index=True)
    # pending | running | success | failed | noop
    status = Column(String(20), default="pending", nullable=False, index=True)
    target_date = Column(String(10))          # YYYY-MM-DD requested end date
    from_date = Column(String(10))            # first new date generated
    days_added = Column(Integer, default=0)
    transactions_added = Column(Integer, default=0)
    items_added = Column(Integer, default=0)
    new_data_max_date = Column(String(10))    # data right edge after the run
    progress_pct = Column(Integer, default=0)
    progress_stage = Column(String(100))
    progress_detail = Column(String(255))
    error = Column(Text)
    requested_by_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    finished_at = Column(DateTime(timezone=True))

    requested_by = relationship("User")


class DatasetConfig(Base):
    """
    Configuration for data source connections.
    
    Each dataset can have its own connection configuration stored as JSON.
    This allows flexible configuration for different data sources:
    - Snowflake tables/views
    - S3 buckets
    - External databases
    - APIs
    """
    __tablename__ = "dataset_configs"
    
    dataset_key = Column(String(100), primary_key=True)  # e.g., 'transactions', 'products'
    is_connected = Column(Boolean, default=False)  # Is this dataset currently available/connected
    config = Column(Text)  # JSON configuration (connection string, credentials path, etc.)
    last_verified_at = Column(DateTime(timezone=True))  # When was connection last tested
    verified_by_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    updated_by_id = Column(Integer, ForeignKey("users.id"))
    
    # Relationships
    verified_by = relationship("User", foreign_keys=[verified_by_id])
    updated_by = relationship("User", foreign_keys=[updated_by_id])


class Destination(Base):
    """Ad network destinations with credentials for audience activation"""
    __tablename__ = "destinations"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Network identification
    network_id = Column(String(50), nullable=False)  # 'facebook', 'trade_desk', 'google_display', etc.
    name = Column(String(255), nullable=False)  # User-defined name like "My Facebook Ads Account"
    description = Column(Text)
    
    # Credentials (encrypted in a real app - stored as JSON)
    # Structure varies by network:
    # facebook: {"account_id": "...", "access_token": "...", "pixel_id": "..."}
    # trade_desk: {"partner_id": "...", "advertiser_id": "...", "api_key": "..."}
    # google_display: {"customer_id": "...", "developer_token": "...", "refresh_token": "..."}
    # amazon_dsp: {"advertiser_id": "...", "client_id": "...", "client_secret": "..."}
    # criteo: {"client_id": "...", "client_secret": "...", "advertiser_id": "..."}
    # liveramp: {"account_id": "...", "api_key": "...", "secret_key": "..."}
    credentials = Column(Text, nullable=False)  # JSON string of credentials
    
    # Status
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)  # Whether connection has been tested
    last_synced = Column(DateTime(timezone=True))  # Last time audiences were synced
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationship
    user = relationship("User")


class Creative(Base):
    """Ad creatives for display campaigns with legal review workflow"""
    __tablename__ = "creatives"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Basic info
    name = Column(String(255), nullable=False)
    description = Column(Text)
    
    # Ad format details
    format_type = Column(String(50), nullable=False)  # 'static_image', 'animated_gif', 'html5', 'video', 'native', 'rich_media'
    dimensions = Column(String(50))  # e.g., '300x250', '728x90'
    file_type = Column(String(50))  # e.g., 'image/png', 'image/jpeg', 'video/mp4'
    
    # File info (mock for demo)
    file_name = Column(String(255))
    file_url = Column(String(500))  # Mock URL
    file_size_kb = Column(Integer)
    
    # Landing page & tracking
    landing_url = Column(String(500))  # Click-through URL
    tracking_pixels = Column(Text)  # JSON array of tracking pixel URLs
    alt_text = Column(String(255))  # Accessibility alt text
    
    # Brand safety & compliance
    advertiser_name = Column(String(255))  # Brand/advertiser name shown on ad
    contains_animation = Column(Boolean, default=False)
    contains_audio = Column(Boolean, default=False)
    target_audience = Column(String(100))  # 'general', 'adult_only', 'alcohol', etc.
    
    # Review workflow
    status = Column(String(50), default="draft")  # 'draft', 'pending_review', 'in_review', 'approved', 'rejected', 'revision_requested'
    submitted_at = Column(DateTime(timezone=True))
    reviewed_at = Column(DateTime(timezone=True))
    reviewer_name = Column(String(255))
    reviewer_notes = Column(Text)  # Feedback from legal/compliance team
    rejection_reason = Column(String(255))  # Category of rejection if rejected
    
    # Metadata
    tags = Column(Text)  # JSON array of tags for organization
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationship
    user = relationship("User")


# ============================================================================
# ADMIN-CONFIGURABLE SETTINGS (stored in PostgreSQL)
# These models replace the previous hardcoded dictionaries
# ============================================================================

class AdNetwork(Base):
    """Admin-configurable ad network definitions"""
    __tablename__ = "ad_networks"
    
    id = Column(Integer, primary_key=True, index=True)
    network_id = Column(String(50), unique=True, nullable=False)  # 'facebook', 'trade_desk'
    name = Column(String(255), nullable=False)  # 'Facebook/Meta Ads'
    icon = Column(String(10), default="🔗")  # Emoji icon
    category = Column(String(50), nullable=False)  # 'digital', 'instore'
    
    # Credential fields as JSON array:
    # [{"key": "account_id", "label": "Account ID", "type": "text", "placeholder": "...", "required": true}]
    credentials_schema = Column(Text, nullable=False)
    
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)  # For ordering in UI
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class CreativeFormat(Base):
    """Admin-configurable creative format types"""
    __tablename__ = "creative_formats"
    
    id = Column(Integer, primary_key=True, index=True)
    format_id = Column(String(50), unique=True, nullable=False)  # 'static_image', 'video'
    name = Column(String(255), nullable=False)  # 'Static Image'
    description = Column(Text)  # 'Single static image (JPG, PNG, WebP)'
    
    # Allowed file types as JSON array: ["image/jpeg", "image/png"]
    file_types = Column(Text, nullable=False)
    max_size_kb = Column(Integer, default=150)
    
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class AdDimension(Base):
    """Admin-configurable ad dimensions (IAB standard sizes)"""
    __tablename__ = "ad_dimensions"
    
    id = Column(Integer, primary_key=True, index=True)
    dimension_id = Column(String(20), unique=True, nullable=False)  # '300x250'
    name = Column(String(255), nullable=False)  # 'Medium Rectangle'
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    category = Column(String(50), nullable=False)  # 'standard', 'mobile', 'video', 'native'
    
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


# Creative review status definitions (kept as constant - these are workflow states)
CREATIVE_STATUSES = {
    "draft": {"label": "Draft", "color": "slate", "description": "Creative is being prepared"},
    "pending_review": {"label": "Pending Review", "color": "amber", "description": "Waiting for legal/compliance review"},
    "in_review": {"label": "In Review", "color": "blue", "description": "Currently being reviewed by legal team"},
    "approved": {"label": "Approved", "color": "green", "description": "Creative approved for use in campaigns"},
    "rejected": {"label": "Rejected", "color": "red", "description": "Creative rejected - see notes"},
    "revision_requested": {"label": "Revision Requested", "color": "orange", "description": "Changes required before approval"},
}


# ============================================================================
# DEFAULT DATA for seeding (used when initializing the database)
# ============================================================================

DEFAULT_AD_NETWORKS = [
    # Digital Ad Networks
    {"network_id": "facebook", "name": "Facebook/Meta Ads", "icon": "📘", "category": "digital", "sort_order": 1,
     "credentials_schema": '[{"key": "account_id", "label": "Ad Account ID", "type": "text", "placeholder": "act_123456789", "required": true}, {"key": "access_token", "label": "Access Token", "type": "password", "placeholder": "Your long-lived access token", "required": true}, {"key": "pixel_id", "label": "Pixel ID (Optional)", "type": "text", "placeholder": "123456789", "required": false}]'},
    {"network_id": "trade_desk", "name": "The Trade Desk", "icon": "📊", "category": "digital", "sort_order": 2,
     "credentials_schema": '[{"key": "partner_id", "label": "Partner ID", "type": "text", "placeholder": "Your partner ID", "required": true}, {"key": "advertiser_id", "label": "Advertiser ID", "type": "text", "placeholder": "Your advertiser ID", "required": true}, {"key": "api_key", "label": "API Key", "type": "password", "placeholder": "Your API key", "required": true}]'},
    {"network_id": "google_display", "name": "Google Display Network", "icon": "🌐", "category": "digital", "sort_order": 3,
     "credentials_schema": '[{"key": "customer_id", "label": "Customer ID", "type": "text", "placeholder": "123-456-7890", "required": true}, {"key": "developer_token", "label": "Developer Token", "type": "password", "placeholder": "Your developer token", "required": true}, {"key": "refresh_token", "label": "Refresh Token", "type": "password", "placeholder": "OAuth refresh token", "required": true}]'},
    {"network_id": "amazon_dsp", "name": "Amazon DSP", "icon": "📦", "category": "digital", "sort_order": 4,
     "credentials_schema": '[{"key": "advertiser_id", "label": "Advertiser ID", "type": "text", "placeholder": "ENTITY123456", "required": true}, {"key": "client_id", "label": "Client ID", "type": "text", "placeholder": "amzn1.application-oa2-client.xxx", "required": true}, {"key": "client_secret", "label": "Client Secret", "type": "password", "placeholder": "Your client secret", "required": true}]'},
    {"network_id": "criteo", "name": "Criteo", "icon": "🎯", "category": "digital", "sort_order": 5,
     "credentials_schema": '[{"key": "client_id", "label": "Client ID", "type": "text", "placeholder": "Your API client ID", "required": true}, {"key": "client_secret", "label": "Client Secret", "type": "password", "placeholder": "Your API client secret", "required": true}, {"key": "advertiser_id", "label": "Advertiser ID", "type": "text", "placeholder": "Your advertiser ID", "required": true}]'},
    {"network_id": "liveramp", "name": "LiveRamp", "icon": "🔗", "category": "digital", "sort_order": 6,
     "credentials_schema": '[{"key": "account_id", "label": "Account ID", "type": "text", "placeholder": "Your LiveRamp account ID", "required": true}, {"key": "api_key", "label": "API Key", "type": "password", "placeholder": "Your API key", "required": true}, {"key": "secret_key", "label": "Secret Key", "type": "password", "placeholder": "Your secret key", "required": true}]'},
    # In-Store Networks
    {"network_id": "grocery_tv", "name": "GroceryTV", "icon": "📺", "category": "instore", "sort_order": 10,
     "credentials_schema": '[{"key": "retailer_id", "label": "Retailer ID", "type": "text", "placeholder": "Your GroceryTV retailer ID", "required": true}, {"key": "api_key", "label": "API Key", "type": "password", "placeholder": "Your API key", "required": true}, {"key": "campaign_manager_email", "label": "Campaign Manager Email", "type": "text", "placeholder": "manager@company.com", "required": false}]'},
    {"network_id": "vusion_group", "name": "VusionGroup", "icon": "🏷️", "category": "instore", "sort_order": 11,
     "credentials_schema": '[{"key": "store_group_id", "label": "Store Group ID", "type": "text", "placeholder": "Your VusionGroup store group ID", "required": true}, {"key": "client_id", "label": "Client ID", "type": "text", "placeholder": "Your client ID", "required": true}, {"key": "client_secret", "label": "Client Secret", "type": "password", "placeholder": "Your client secret", "required": true}, {"key": "environment", "label": "Environment", "type": "text", "placeholder": "production or sandbox", "required": false}]'},
]

DEFAULT_CREATIVE_FORMATS = [
    {"format_id": "static_image", "name": "Static Image", "description": "Single static image (JPG, PNG, WebP)", "file_types": '["image/jpeg", "image/png", "image/webp"]', "max_size_kb": 150, "sort_order": 1},
    {"format_id": "animated_gif", "name": "Animated GIF", "description": "Animated GIF image (max 30 seconds, 3 loops)", "file_types": '["image/gif"]', "max_size_kb": 500, "sort_order": 2},
    {"format_id": "html5", "name": "HTML5 Banner", "description": "Interactive HTML5 creative (ZIP package)", "file_types": '["application/zip"]', "max_size_kb": 200, "sort_order": 3},
    {"format_id": "video", "name": "Video Ad", "description": "Video creative (MP4, WebM - 6s, 15s, or 30s)", "file_types": '["video/mp4", "video/webm"]', "max_size_kb": 10000, "sort_order": 4},
    {"format_id": "native", "name": "Native Ad", "description": "Native format with headline, image, and description", "file_types": '["image/jpeg", "image/png"]', "max_size_kb": 150, "sort_order": 5},
    {"format_id": "rich_media", "name": "Rich Media", "description": "Expandable or interactive rich media unit", "file_types": '["application/zip"]', "max_size_kb": 500, "sort_order": 6},
]

DEFAULT_AD_DIMENSIONS = [
    {"dimension_id": "300x250", "name": "Medium Rectangle", "width": 300, "height": 250, "category": "standard", "sort_order": 1},
    {"dimension_id": "728x90", "name": "Leaderboard", "width": 728, "height": 90, "category": "standard", "sort_order": 2},
    {"dimension_id": "160x600", "name": "Wide Skyscraper", "width": 160, "height": 600, "category": "standard", "sort_order": 3},
    {"dimension_id": "300x600", "name": "Half Page", "width": 300, "height": 600, "category": "standard", "sort_order": 4},
    {"dimension_id": "970x250", "name": "Billboard", "width": 970, "height": 250, "category": "standard", "sort_order": 5},
    {"dimension_id": "320x50", "name": "Mobile Leaderboard", "width": 320, "height": 50, "category": "mobile", "sort_order": 6},
    {"dimension_id": "320x100", "name": "Large Mobile Banner", "width": 320, "height": 100, "category": "mobile", "sort_order": 7},
    {"dimension_id": "320x480", "name": "Mobile Interstitial", "width": 320, "height": 480, "category": "mobile", "sort_order": 8},
    {"dimension_id": "300x50", "name": "Mobile Banner", "width": 300, "height": 50, "category": "mobile", "sort_order": 9},
    {"dimension_id": "970x90", "name": "Super Leaderboard", "width": 970, "height": 90, "category": "standard", "sort_order": 10},
    {"dimension_id": "250x250", "name": "Square", "width": 250, "height": 250, "category": "standard", "sort_order": 11},
    {"dimension_id": "200x200", "name": "Small Square", "width": 200, "height": 200, "category": "standard", "sort_order": 12},
    {"dimension_id": "336x280", "name": "Large Rectangle", "width": 336, "height": 280, "category": "standard", "sort_order": 13},
    {"dimension_id": "120x600", "name": "Skyscraper", "width": 120, "height": 600, "category": "standard", "sort_order": 14},
    {"dimension_id": "1920x1080", "name": "Video (16:9 HD)", "width": 1920, "height": 1080, "category": "video", "sort_order": 15},
    {"dimension_id": "1080x1920", "name": "Video (9:16 Vertical)", "width": 1080, "height": 1920, "category": "video", "sort_order": 16},
    {"dimension_id": "1200x628", "name": "Native/Social", "width": 1200, "height": 628, "category": "native", "sort_order": 17},
]


class Campaign(Base):
    """Marketing campaigns with different types and targeting"""
    __tablename__ = "campaigns"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Basic info
    name = Column(String(255), nullable=False)
    description = Column(Text)
    campaign_type = Column(String(50), nullable=False)  # 'price_promotion', 'sponsored_listing', 'display_ad_onsite', 'display_ad_offsite'
    status = Column(String(20), default="draft")  # 'draft', 'scheduled', 'active', 'paused', 'completed'
    
    # Date range
    start_date = Column(DateTime(timezone=True), nullable=False)
    end_date = Column(DateTime(timezone=True), nullable=False)
    
    # Product targeting (optional)
    target_type = Column(String(20))  # 'upc', 'brand', 'category', or NULL for non-product campaigns
    target_upc = Column(String(50))
    target_brand = Column(String(255))
    target_category = Column(String(255))
    
    # Shopper cohort targeting (optional)
    cohort_id = Column(Integer, ForeignKey("shopper_cohorts.id"))
    
    # Campaign-type specific configuration (JSON)
    # For price_promotion: {"discount_type": "percent"|"fixed", "discount_value": 10}
    # For sponsored_listing: {"keywords": ["milk", "dairy"]}
    # For display_ad_onsite: {"keywords": ["milk"], "creative_url": "...", "creative_filename": "..."}
    # For display_ad_offsite: {"ad_networks": ["facebook", "trade_desk"], "creative_url": "...", "creative_filename": "..."}
    configuration = Column(Text)  # JSON string
    
    # Automation settings
    # When enabled, the campaign can be triggered automatically based on conditions
    automation_enabled = Column(Boolean, default=False)
    automation_type = Column(String(50))  # 'low_inventory', 'price_drop', etc.
    automation_config = Column(Text)  # JSON: {"threshold": 50, "check_frequency": "daily"}
    automation_trigger_count = Column(Integer, default=0)
    automation_last_triggered = Column(DateTime(timezone=True))
    automation_status = Column(String(20), default="paused")  # 'active', 'paused'
    
    # Metrics (can be updated as campaign runs)
    impressions = Column(Integer, default=0)
    clicks = Column(Integer, default=0)
    conversions = Column(Integer, default=0)
    spend = Column(Float, default=0.0)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    user = relationship("User")
    cohort = relationship("ShopperCohort")


class StandaloneAutomation(Base):
    """
    Standalone automations created directly in the Automations section.
    These are separate from campaign-based automations and follow a flexible
    condition/action framework.
    
    Schema:
    - description: Natural language explanation (human & AI readable)
    - scope: What items this applies to (e.g., specific products/categories)
    - conditions: Array of condition objects (object, metric, operator, value)
    - actions: Array of action objects (object, action, parameters)
    """
    __tablename__ = "standalone_automations"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Identity
    name = Column(String(200), nullable=False)
    description = Column(Text)  # Natural language description for human & AI understanding
    status = Column(String(50), default="draft")  # 'draft', 'active', 'paused'
    
    # Scope - What items this automation applies to (JSON)
    # Format: { "object": "product", "filter": { "type": "category", "values": ["Grocery"] } }
    scope = Column(Text)
    
    # Conditions - When to trigger (JSON array)
    # Format: [{ "id": "cond_1", "object": "product", "metric": "days_on_hand", "operator": "greater_than", "value": 70, "time_window_days": null }]
    conditions = Column(Text)
    condition_logic = Column(String(10), default="AND")  # 'AND' or 'OR'
    
    # Actions - What to do (JSON array)
    # Format: [{ "id": "act_1", "object": "promotion", "action": "create", "parameters": { "discount_percent": 15 } }]
    actions = Column(Text)
    
    # Runtime stats
    trigger_count = Column(Integer, default=0)
    last_triggered = Column(DateTime(timezone=True))
    
    # Audit
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationship
    user = relationship("User")


class ProductEdit(Base):
    """Product edit requests with approval workflow"""
    __tablename__ = "product_edits"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Product identification
    upc = Column(String(50), nullable=False)
    product_name = Column(String(255))  # Current product name for reference
    
    # The proposed changes (JSON with field: {old_value, new_value})
    changes = Column(Text, nullable=False)  # JSON: {"price": {"old": 4.99, "new": 5.99}, "product_name": {"old": "...", "new": "..."}}
    
    # Edit reason/justification
    reason = Column(Text)
    
    # Review workflow (similar to Creative)
    status = Column(String(50), default="pending")  # 'pending', 'in_review', 'approved', 'rejected', 'applied'
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())
    reviewed_at = Column(DateTime(timezone=True))
    reviewed_by = Column(Integer, ForeignKey("users.id"))
    reviewer_notes = Column(Text)
    rejection_reason = Column(String(255))
    applied_at = Column(DateTime(timezone=True))  # When the change was applied to Snowflake
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    reviewer = relationship("User", foreign_keys=[reviewed_by])


# Product edit status definitions
PRODUCT_EDIT_STATUSES = {
    "pending": {"label": "Pending Review", "color": "amber", "description": "Edit waiting for approval"},
    "in_review": {"label": "In Review", "color": "blue", "description": "Currently being reviewed"},
    "approved": {"label": "Approved", "color": "green", "description": "Edit approved - pending application"},
    "rejected": {"label": "Rejected", "color": "red", "description": "Edit rejected - see notes"},
    "applied": {"label": "Applied", "color": "emerald", "description": "Changes have been applied to product data"},
}


class UserDocument(Base):
    """User-uploaded documents with AI-parsed content for Agreements/Partnership section"""
    __tablename__ = "user_documents"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # File information
    file_name = Column(String(255), nullable=False)  # Original filename
    file_type = Column(String(50))  # 'pdf', 'docx', 'txt', etc.
    file_size_bytes = Column(Integer)
    stage_path = Column(String(500), nullable=False)  # Path in Snowflake stage
    
    # Document category/type
    document_type = Column(String(100), default="agreement")  # 'agreement', 'contract', 'other'
    description = Column(Text)
    
    # AI-parsed content
    parsed_content = Column(Text)  # The markdown/text output from AI_PARSE_DOCUMENT
    parse_status = Column(String(50), default="pending")  # 'pending', 'processing', 'completed', 'error'
    parse_error = Column(Text)  # Error message if parsing failed
    parsed_at = Column(DateTime(timezone=True))  # When parsing completed
    
    # Metadata
    page_count = Column(Integer)  # Number of pages in document
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationship
    user = relationship("User")


# ============================================================================
# DATASET DEFINITIONS
# These represent the data sources that modules may depend on
# ============================================================================

AVAILABLE_DATASETS = [
    {"key": "transactions", "label": "Transactions", "description": "Transaction and sales data"},
    {"key": "products", "label": "Products", "description": "Product catalog and attributes"},
    {"key": "shoppers", "label": "Shoppers", "description": "Customer/shopper profiles"},
    {"key": "stores", "label": "Stores", "description": "Store locations and attributes"},
    {"key": "inventory", "label": "Inventory", "description": "Stock levels and inventory data"},
    {"key": "fulfillment", "label": "Fulfillment", "description": "Order fulfillment and delivery data"},
    {"key": "labor", "label": "Labor", "description": "Staff scheduling and labor data"},
    {"key": "demand_forecast", "label": "Demand Forecast", "description": "Demand forecasting and predictions"},
    {"key": "weather", "label": "Weather", "description": "Weather data for contextual analysis"},
    {"key": "competitor_pricing", "label": "Competitor Pricing", "description": "Competitor price monitoring data"},
]


# ============================================================================
# MODULE DEFINITIONS
# All available modules in the system with their dataset dependencies
# ============================================================================

AVAILABLE_MODULES = [
    # === Core / General ===
    {"key": "dashboard", "label": "Dashboard", "section": None, 
     "requires_datasets": ["transactions", "products", "shoppers"],
     "description": "Overview of key metrics and performance"},
    
    {"key": "ai_assistant", "label": "AI Assistant", "section": None, 
     "requires_datasets": ["transactions", "products"],
     "description": "AI-powered analytics assistant"},
    
    {"key": "automations", "label": "Automations", "section": None, 
     "requires_datasets": [],
     "description": "Automated workflows and triggers"},
    
    # === Audience ===
    {"key": "audience.assistant", "label": "Assistant", "section": "Audience", 
     "requires_datasets": ["shoppers", "transactions"],
     "description": "AI assistant for audience building"},
    
    {"key": "audience.shopper_cohorts", "label": "Shopper Cohorts", "section": "Audience", 
     "requires_datasets": ["shoppers", "transactions"],
     "description": "Create and manage shopper segments"},
    
    {"key": "audience.market_cohorts", "label": "Market Cohorts", "section": "Audience", 
     "requires_datasets": ["shoppers", "transactions", "products"],
     "description": "Market-based audience segmentation"},
    
    # === Insights ===
    {"key": "insights.assistant", "label": "Assistant", "section": "Insights", 
     "requires_datasets": ["transactions", "products"],
     "description": "AI assistant for analytics insights"},
    
    {"key": "insights.sales_analytics", "label": "Sales Analytics", "section": "Insights", 
     "requires_datasets": ["transactions", "products"],
     "description": "Sales trends and performance analysis"},
    
    {"key": "insights.market_basket", "label": "Market Basket", "section": "Insights", 
     "requires_datasets": ["transactions", "products"],
     "description": "Product affinity and basket analysis"},
    
    {"key": "insights.store_performance", "label": "Store Performance", "section": "Insights", 
     "requires_datasets": ["transactions", "stores"],
     "description": "Store-level performance metrics"},
    
    # === Activation ===
    {"key": "activation.assistant", "label": "Assistant", "section": "Activation", 
     "requires_datasets": [],
     "description": "AI assistant for campaign activation"},
    
    {"key": "activation.creatives", "label": "Creatives", "section": "Activation", 
     "requires_datasets": [],
     "description": "Manage ad creatives and assets"},
    
    {"key": "activation.campaigns", "label": "Campaigns", "section": "Activation", 
     "requires_datasets": [],
     "description": "Create and manage marketing campaigns"},
    
    {"key": "activation.destinations", "label": "Destinations", "section": "Activation", 
     "requires_datasets": [],
     "description": "Configure ad network connections"},
    
    {"key": "activation.measurement", "label": "Measurement", "section": "Activation", 
     "requires_datasets": ["transactions"],
     "description": "Campaign measurement and attribution"},
    
    # === Operations ===
    {"key": "operations.assistant", "label": "Assistant", "section": "Operations", 
     "requires_datasets": ["products", "inventory"],
     "description": "AI assistant for operations"},
    
    {"key": "operations.product_catalog", "label": "Product Catalog", "section": "Operations", 
     "requires_datasets": ["products"],
     "description": "Manage product catalog and attributes"},
    
    {"key": "operations.store_assortment", "label": "Store Assortment", "section": "Operations", 
     "requires_datasets": ["products", "stores", "transactions"],
     "description": "Store-specific product assortments"},
    
    {"key": "operations.availability", "label": "Availability", "section": "Operations", 
     "requires_datasets": ["products", "inventory", "stores"],
     "description": "Product availability and stock status"},
    
    {"key": "operations.fulfillment", "label": "Fulfillment", "section": "Operations", 
     "requires_datasets": ["fulfillment", "stores"],
     "description": "Order fulfillment and delivery tracking"},
    
    {"key": "operations.labor", "label": "Labor", "section": "Operations", 
     "requires_datasets": ["labor", "stores"],
     "description": "Staff scheduling and labor management"},
    
    {"key": "operations.demand", "label": "Demand", "section": "Operations", 
     "requires_datasets": ["demand_forecast", "products", "stores"],
     "description": "Demand forecasting and planning"},
    
    {"key": "operations.performance", "label": "Performance", "section": "Operations", 
     "requires_datasets": ["transactions", "stores", "inventory"],
     "description": "Operational performance metrics"},
    
    # === Partnership ===
    {"key": "partnership.assistant", "label": "Assistant", "section": "Partnership", 
     "requires_datasets": [],
     "description": "AI assistant for partnerships"},
    
    {"key": "partnership.agreements", "label": "Agreements", "section": "Partnership", 
     "requires_datasets": [],
     "description": "Manage partnership agreements and documents"},
    
    {"key": "partnership.compliance", "label": "Compliance", "section": "Partnership", 
     "requires_datasets": [],
     "description": "Compliance monitoring and reporting"},
]


def get_module_by_key(module_key: str) -> dict:
    """Get module definition by key"""
    for module in AVAILABLE_MODULES:
        if module["key"] == module_key:
            return module
    return None


def get_modules_requiring_dataset(dataset_key: str) -> list:
    """Get all modules that require a specific dataset"""
    return [
        module for module in AVAILABLE_MODULES 
        if dataset_key in module.get("requires_datasets", [])
    ]

