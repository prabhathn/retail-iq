from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base, SessionLocal
from . import date_anchor
from .routes import auth, analytics, tracking, admin, saved_reports, cohorts, campaigns, destinations, creatives, operations, config, cortex_agent, agreements, automations
from .models import (
    AdNetwork, CreativeFormat, AdDimension,
    DEFAULT_AD_NETWORKS, DEFAULT_CREATIVE_FORMATS, DEFAULT_AD_DIMENSIONS
)

# Create database tables
Base.metadata.create_all(bind=engine)

# Auto-seed default configurations on startup
def seed_default_configs():
    """Seed default ad networks, creative formats, and dimensions if tables are empty."""
    db = SessionLocal()
    try:
        # Seed Ad Networks
        if db.query(AdNetwork).count() == 0:
            for network_data in DEFAULT_AD_NETWORKS:
                db.add(AdNetwork(**network_data))
            print(f"[STARTUP] Seeded {len(DEFAULT_AD_NETWORKS)} default ad networks")
        
        # Seed Creative Formats
        if db.query(CreativeFormat).count() == 0:
            for format_data in DEFAULT_CREATIVE_FORMATS:
                db.add(CreativeFormat(**format_data))
            print(f"[STARTUP] Seeded {len(DEFAULT_CREATIVE_FORMATS)} default creative formats")
        
        # Seed Ad Dimensions
        if db.query(AdDimension).count() == 0:
            for dim_data in DEFAULT_AD_DIMENSIONS:
                db.add(AdDimension(**dim_data))
            print(f"[STARTUP] Seeded {len(DEFAULT_AD_DIMENSIONS)} default ad dimensions")
        
        db.commit()
    except Exception as e:
        print(f"[STARTUP] Warning: Failed to seed default configs: {e}")
        db.rollback()
    finally:
        db.close()

seed_default_configs()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown hooks.

    The date-anchor probe lives here rather than at module import (the pattern
    used by seed_default_configs above) for two reasons: it makes a Snowflake
    round trip, which would block application import, and uvicorn --reload
    re-imports the module on every code change, which would re-probe needlessly.

    refresh() never raises - on failure the anchor falls back to CURRENT_DATE so
    a Snowflake hiccup degrades behaviour instead of preventing startup.
    """
    state = date_anchor.refresh()
    if state.get("available"):
        gap = state.get("gap_days")
        print(
            f"[STARTUP] Date anchor = {state['anchor_date']} "
            f"(data {state['data_min_date']} .. {state['data_max_date']}, gap {gap}d)",
            flush=True,
        )
        if gap and gap > 7:
            print(
                f"[STARTUP] NOTE: data is {gap} days behind today. Relative windows "
                f"are computed from the data date. Use the admin Data Window panel "
                f"to top up.",
                flush=True,
            )
    else:
        print(
            f"[STARTUP] Date anchor unavailable ({state.get('error')}); "
            f"falling back to CURRENT_DATE",
            flush=True,
        )
    yield


app = FastAPI(
    title="RetailIQ API",
    description="API for unified retail shopper behavior, sales, and operations analytics",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(analytics.router)
app.include_router(tracking.router)
app.include_router(admin.router)
app.include_router(saved_reports.router)
app.include_router(cohorts.router)
app.include_router(campaigns.router)
app.include_router(destinations.router)
app.include_router(creatives.router)
app.include_router(operations.router)
app.include_router(config.router)
app.include_router(cortex_agent.router)
app.include_router(agreements.router)
app.include_router(automations.router)

@app.get("/")
async def root():
    return {"message": "RetailIQ API", "status": "healthy"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

