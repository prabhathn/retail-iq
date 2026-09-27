from pydantic import BaseModel, EmailStr
from typing import Optional, List, Any
from datetime import datetime, date

# Auth schemas
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    company: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    company: Optional[str]
    role: str
    scope_id: Optional[int] = None  # User's permission scope
    
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

# Analytics schemas
class DateRangeFilter(BaseModel):
    start_date: date
    end_date: date

class CategorySalesRequest(BaseModel):
    category: Optional[str] = None
    brand: Optional[str] = None
    upc: Optional[str] = None
    start_date: date
    end_date: date
    group_by: str = "day"  # day, week, month
    cohort_id: Optional[int] = None  # Filter by shopper cohort
    # Location filters (from advanced options)
    region: Optional[str] = None
    store_id: Optional[str] = None

class MarketBasketRequest(BaseModel):
    product_upc: str
    start_date: date
    end_date: date
    min_support: float = 0.01
    limit: int = 20
    cohort_id: Optional[int] = None  # Filter by shopper cohort

class ShopperCohortRequest(BaseModel):
    cohort_type: str  # frequency, recency, monetary, category_affinity
    start_date: date
    end_date: date
    num_segments: int = 5

class StorePerformanceRequest(BaseModel):
    store_ids: Optional[List[str]] = None
    region: Optional[str] = None
    start_date: date
    end_date: date
    metric: str = "sales"  # sales, transactions, basket_size
    cohort_id: Optional[int] = None  # Filter by shopper cohort
    # Product filters
    upc: Optional[str] = None
    brand: Optional[str] = None
    category: Optional[str] = None

class AnalyticsResponse(BaseModel):
    data: List[Any]
    metadata: dict = {}

# Filter options schemas
class FilterOptions(BaseModel):
    categories: List[str]
    brands: List[str]
    subcategories: List[str] = []
    stores: List[dict]
    regions: List[str]

