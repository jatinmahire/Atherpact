"""
AetherPact — FastAPI application entry point.
Loads all routers, initializes the DB, seeds demo data, and preloads the
sentence-transformer model at startup so the first /match call is instant.
"""

import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()  # Phase 37/38 (Addendum 4): FIREBASE_*/RAZORPAY_* secrets, before any router imports them

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text as sa_text

from database import create_tables, SessionLocal, seed_database
from routers import auth, listings, match, negotiate, laya_router, audit, bookings, reviews, analytics, contact, trust, weather_twin

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("aetherpact")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────────────
    logger.info("Creating DB tables…")
    create_tables()

    logger.info("Seeding demo data…")
    with SessionLocal() as db:
        seed_database(db)

    logger.info("Provisioning real Firebase accounts for demo users…")
    from services.firebase_service import provision_seed_accounts
    try:
        provision_seed_accounts()
    except Exception as e:
        logger.error(
            f"Could not provision Firebase seed accounts ({e}). Auth will fail "
            "until FIREBASE_SERVICE_ACCOUNT_PATH points to a valid key — see "
            "Addendum 4, Phase 37's manual setup step."
        )

    logger.info("Pre-loading sentence-transformer (all-MiniLM-L6-v2)…")
    from services.matcher import get_model
    get_model()  # loads once; subsequent calls hit the module-level cache

    logger.info("Building vector index (Phase 12)…")
    from services import vector_index
    from database import Asset
    with SessionLocal() as db:
        active_assets = db.query(Asset).filter(Asset.is_active == True).all()
        vector_index.rebuild(active_assets)

    # Addendum 8, Phase 59: Laya's eager preload was disabled here — on a
    # memory-constrained instance, loading MiniLM + the vector index + Laya
    # (torch/transformers, ~800MB checkpoint) all in one startup burst was
    # observed to crash the process at the OS level (no Python exception
    # to catch; confirmed by wrapping this same call in try/except and
    # still losing the process). Laya's own functions in laya_service.py
    # already lazy-load it on first real call and fail soft to a neutral
    # default if it's ever unavailable, so this only trades a slower first
    # advisory call for a startup that doesn't risk crashing on tighter
    # memory budgets — exactly the trade-off Phase 59 itself calls out as
    # acceptable ("Claude Code can disable Laya specifically to fit a
    # smaller tier, since it was always designed to be optional").
    logger.info("Laya will lazy-load on first real use (not pre-loaded at startup).")

    logger.info("AetherPact backend ready ✓")
    yield
    # ── Shutdown ─────────────────────────────────────────────────────────────
    logger.info("Shutting down…")


app = FastAPI(
    title="AetherPact API",
    description="B2B hospitality resource marketplace — local, offline, hackathon build.",
    version="1.0.0",
    lifespan=lifespan,
)

# Addendum 8, Phase 56: the real deployed frontend origin (Vercel) is added
# via CORS_ALLOWED_ORIGINS (comma-separated) once known, on top of the
# local dev origins that always stay allowed.
_extra_origins = [o.strip() for o in os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", *_extra_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(listings.router)
app.include_router(match.router)
app.include_router(negotiate.router)
app.include_router(laya_router.router)
app.include_router(audit.router)
app.include_router(bookings.router)
app.include_router(reviews.router)
app.include_router(analytics.router)
app.include_router(contact.router)
app.include_router(trust.router)
app.include_router(weather_twin.router)

# Serve uploaded audit images so the frontend can display them
from pathlib import Path
Path("audit_images").mkdir(exist_ok=True)
app.mount("/audit_images", StaticFiles(directory="audit_images"), name="audit_images")

# Serve uploaded listing photos (Addendum 5)
Path("listing_images").mkdir(exist_ok=True)
app.mount("/listing_images", StaticFiles(directory="listing_images"), name="listing_images")


@app.get("/health")
def health():
    """
    Addendum 8, Phase 56: real per-component status, not a fixed string —
    Render polls this to know the service is actually alive and ready, not
    just that the process started.
    """
    from services.matcher import _model as matcher_model
    from services.llm_service import _llm
    from services.laya_service import _laya

    db_ok = True
    try:
        with SessionLocal() as db:
            db.execute(sa_text("SELECT 1"))
    except Exception:
        db_ok = False

    components = {
        "database": "connected" if db_ok else "unreachable",
        "matching_model": "loaded" if matcher_model is not None else "not loaded",
        "negotiation_engine": "available",  # pure Python, no external state to load
        "vision_pipeline": "available",     # OpenCV, no external state to load
        "llm_phrasing": "loaded" if _llm is not None else "unavailable (deterministic template fallback active)",
        "laya_advisory": "loaded" if _laya is not None else "unavailable (neutral-default fallback active)",
    }
    overall_ok = db_ok and matcher_model is not None
    return {
        "status": "ok" if overall_ok else "degraded",
        "project": "AetherPact",
        **components,
    }
