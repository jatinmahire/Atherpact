"""
AetherPact — FastAPI application entry point.
Loads all routers, initializes the DB, seeds demo data, and preloads the
sentence-transformer model at startup so the first /match call is instant.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database import create_tables, SessionLocal, seed_database
from routers import auth, listings, match, negotiate, laya_router, audit, bookings, reviews, analytics, contact

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

    logger.info("Pre-loading sentence-transformer (all-MiniLM-L6-v2)…")
    from services.matcher import get_model
    get_model()  # loads once; subsequent calls hit the module-level cache

    logger.info("Building vector index (Phase 12)…")
    from services import vector_index
    from database import Asset
    with SessionLocal() as db:
        active_assets = db.query(Asset).filter(Asset.is_active == True).all()
        vector_index.rebuild(active_assets)

    logger.info("Attempting to pre-load Laya…")
    from services.laya_service import _get_laya
    _get_laya()

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
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

# Serve uploaded audit images so the frontend can display them
from pathlib import Path
Path("audit_images").mkdir(exist_ok=True)
app.mount("/audit_images", StaticFiles(directory="audit_images"), name="audit_images")


@app.get("/health")
def health():
    return {"status": "ok", "project": "AetherPact"}
