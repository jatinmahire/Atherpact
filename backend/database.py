"""
AetherPact — SQLite schema, engine setup, and seed data.
Phase 2: Core Data Model, Listings, and Availability
"""

import math
import hashlib
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    create_engine, Column, String, Float, Integer, Boolean,
    DateTime, Text, ForeignKey, CheckConstraint, event
)
from sqlalchemy.orm import declarative_base, sessionmaker, Session

DATABASE_URL = "sqlite:///./aetherpact.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

# Enable WAL mode and foreign-key enforcement for SQLite
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ─────────────────────────────────────────────────────────────────────────────
# ORM Models
# ─────────────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"
    id            = Column(String, primary_key=True)       # UUID
    email         = Column(String, unique=True, nullable=False)
    hashed_pw     = Column(String, nullable=False)
    display_name  = Column(String, nullable=False)
    role          = Column(String, nullable=False)          # "provider" | "seeker" | "both"
    created_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Asset(Base):
    """A resource listed by a provider."""
    __tablename__ = "assets"
    id            = Column(String, primary_key=True)
    owner_id      = Column(String, ForeignKey("users.id"), nullable=False)
    title         = Column(String, nullable=False)
    description   = Column(Text, nullable=False)
    category      = Column(String, nullable=False)          # e.g. "banquet_hall"
    price_per_day = Column(Float, nullable=False)
    lat           = Column(Float, nullable=False)
    lon           = Column(Float, nullable=False)
    address       = Column(String, nullable=False)
    capacity      = Column(Integer, nullable=True)
    is_active     = Column(Boolean, default=True)
    created_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class AvailabilityWindow(Base):
    """
    Contiguous time window during which an asset can be booked.
    A confirmed booking must fit inside one window and cannot overlap another booking.
    """
    __tablename__ = "availability_windows"
    id        = Column(String, primary_key=True)
    asset_id  = Column(String, ForeignKey("assets.id"), nullable=False)
    starts_at = Column(DateTime, nullable=False)
    ends_at   = Column(DateTime, nullable=False)
    __table_args__ = (
        CheckConstraint("ends_at > starts_at", name="chk_window_order"),
    )


class Requirement(Base):
    """A seeker's posted resource need."""
    __tablename__ = "requirements"
    id          = Column(String, primary_key=True)
    seeker_id   = Column(String, nullable=True)          # nullable — anonymous searches allowed
    description = Column(Text, nullable=False)
    budget      = Column(Float, default=0.0)
    lat         = Column(Float, nullable=True)
    lon         = Column(Float, nullable=True)
    created_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class MatchResult(Base):
    __tablename__ = "match_results"
    id              = Column(String, primary_key=True)
    requirement_id  = Column(String, ForeignKey("requirements.id"), nullable=False)
    asset_id        = Column(String, ForeignKey("assets.id"), nullable=False)
    semantic_score  = Column(Float)
    price_score     = Column(Float)
    distance_score  = Column(Float)
    final_score     = Column(Float)
    created_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Negotiation(Base):
    __tablename__ = "negotiations"
    id              = Column(String, primary_key=True)
    asset_id        = Column(String, ForeignKey("assets.id"), nullable=False)
    provider_id     = Column(String, ForeignKey("users.id"), nullable=False)
    seeker_id       = Column(String, ForeignKey("users.id"), nullable=False)
    provider_ask    = Column(Float, nullable=False)
    provider_min    = Column(Float, nullable=False)
    seeker_offer    = Column(Float, nullable=False)
    seeker_max      = Column(Float, nullable=False)
    clearing_price  = Column(Float, nullable=True)
    status          = Column(String, nullable=False)   # "settled" | "no_deal"
    llm_phrasing    = Column(Text, nullable=True)
    extra_terms     = Column(Text, nullable=True)
    created_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Booking(Base):
    __tablename__ = "bookings"
    id              = Column(String, primary_key=True)
    asset_id        = Column(String, ForeignKey("assets.id"), nullable=False)
    negotiation_id  = Column(String, ForeignKey("negotiations.id"), nullable=True)
    seeker_id       = Column(String, ForeignKey("users.id"), nullable=False)
    starts_at       = Column(DateTime, nullable=False)
    ends_at         = Column(DateTime, nullable=False)
    status          = Column(String, default="confirmed")  # "confirmed" | "cancelled"
    created_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    __table_args__ = (
        CheckConstraint("ends_at > starts_at", name="chk_booking_order"),
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id             = Column(String, primary_key=True)
    booking_id     = Column(String, ForeignKey("bookings.id"), nullable=False)
    event_type     = Column(String, nullable=False)    # "checkin" | "checkout"
    image_path     = Column(String, nullable=True)
    change_regions = Column(Text, nullable=True)       # JSON list of bounding boxes
    created_at     = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Rating(Base):
    __tablename__ = "ratings"
    id          = Column(String, primary_key=True)
    booking_id  = Column(String, ForeignKey("bookings.id"), nullable=False)
    rater_id    = Column(String, ForeignKey("users.id"), nullable=False)
    score       = Column(Integer, nullable=False)      # 1-5
    comment     = Column(Text, nullable=True)
    created_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class DecisionFlag(Base):
    """Stores all Laya advisory outputs — never blocks any flow."""
    __tablename__ = "decision_flags"
    id          = Column(String, primary_key=True)
    context     = Column(String, nullable=False)   # "listing" | "negotiation" | "chat"
    ref_id      = Column(String, nullable=False)   # ID of the related object
    flag_type   = Column(String, nullable=False)   # "safety" | "dispute_risk" | "intent"
    label       = Column(String, nullable=False)
    confidence  = Column(Float, nullable=True)
    is_advisory = Column(Boolean, default=True)    # always True — never a hard block
    created_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# ─────────────────────────────────────────────────────────────────────────────
# Seed Data (5 realistic Mumbai-area hospitality assets)
# ─────────────────────────────────────────────────────────────────────────────

SEED_PROVIDER_ID   = "seed-provider-001"
SEED_PROVIDER_EMAIL = "seedprovider@aetherpact.demo"


def _hash(pw: str) -> str:
    from passlib.context import CryptContext
    return CryptContext(schemes=["bcrypt"], deprecated="auto").hash(pw)


SEED_ASSETS = [
    {
        "id": "asset-001",
        "owner_id": SEED_PROVIDER_ID,
        "title": "Grand Banquet Hall — Andheri West",
        "description": (
            "Elegant 500-seat air-conditioned banquet hall with a full professional kitchen, "
            "valet parking, bridal suite, and built-in stage. Ideal for weddings, corporate galas, "
            "award nights. Available with in-house catering coordination."
        ),
        "category": "banquet_hall",
        "price_per_day": 85000.0,
        "lat": 19.1367,
        "lon": 72.8296,
        "address": "Lokhandwala Complex, Andheri West, Mumbai 400053",
        "capacity": 500,
    },
    {
        "id": "asset-002",
        "owner_id": SEED_PROVIDER_ID,
        "title": "Licensed Commercial Kitchen — Bandra",
        "description": (
            "FSSAI-certified 1200 sq ft commercial kitchen with 6-burner industrial range, "
            "walk-in cold room, blast chiller, dishwashing bay, and exhaust system. "
            "Ideal for cloud kitchens, caterers, or pop-up food businesses needing a certified space."
        ),
        "category": "commercial_kitchen",
        "price_per_day": 12000.0,
        "lat": 19.0596,
        "lon": 72.8295,
        "address": "Turner Road, Bandra West, Mumbai 400050",
        "capacity": None,
    },
    {
        "id": "asset-003",
        "owner_id": SEED_PROVIDER_ID,
        "title": "Professional AV & Event Equipment Set",
        "description": (
            "Complete AV package: 20 000-lumen laser projector, 360° Bose PA system, "
            "LED video wall (9×6 panels), wireless mic set, professional lighting rig, "
            "and a trained AV technician for setup and operation. Delivered citywide."
        ),
        "category": "av_equipment",
        "price_per_day": 28000.0,
        "lat": 19.0760,
        "lon": 72.8777,
        "address": "Fort, Mumbai 400001",
        "capacity": None,
    },
    {
        "id": "asset-004",
        "owner_id": SEED_PROVIDER_ID,
        "title": "Luxury Shuttle Van Fleet (5 Vans)",
        "description": (
            "Fleet of 5 Toyota Innova Crysta vans, each 7-seater, air-conditioned and GPS-tracked, "
            "with uniformed drivers. Suitable for hotel airport transfers, wedding guest shuttles, "
            "or corporate event transportation across Mumbai."
        ),
        "category": "transportation",
        "price_per_day": 18000.0,
        "lat": 19.0990,
        "lon": 72.8468,
        "address": "Worli, Mumbai 400018",
        "capacity": 35,
    },
    {
        "id": "asset-005",
        "owner_id": SEED_PROVIDER_ID,
        "title": "Rooftop Event Space — Powai Skyline View",
        "description": (
            "Open-air rooftop venue, 8000 sq ft with panoramic Powai Lake view, "
            "permanent bar counter, outdoor DJ booth, fairy-light canopy, and capacity for 200 guests. "
            "Ideal for sundowners, product launches, birthday galas, and themed corporate events."
        ),
        "category": "event_space",
        "price_per_day": 55000.0,
        "lat": 19.1176,
        "lon": 72.9060,
        "address": "Hiranandani Gardens, Powai, Mumbai 400076",
        "capacity": 200,
    },
]


def seed_database(db: Session) -> None:
    """Insert seed users and assets if they don't already exist."""
    # Seed provider user first, commit so FK is satisfied
    if not db.get(User, SEED_PROVIDER_ID):
        db.add(User(
            id=SEED_PROVIDER_ID,
            email=SEED_PROVIDER_EMAIL,
            hashed_pw=_hash("SeedPass123!"),
            display_name="AetherPact Demo Provider",
            role="provider",
        ))
        db.commit()  # commit user before assets

    # Seed assets (FK references user above)
    for data in SEED_ASSETS:
        if not db.get(Asset, data["id"]):
            db.add(Asset(**data))

    db.commit()

    # Seed a sample booking so the audit flow can be tested
    sample_booking_id = "booking-demo-001"
    if not db.get(Booking, sample_booking_id):
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        db.add(Booking(
            id=sample_booking_id,
            asset_id="asset-001",
            negotiation_id=None,
            seeker_id=SEED_PROVIDER_ID,  # provider is also the seeker for demo
            starts_at=now,
            ends_at=now + timedelta(days=7),
            status="confirmed",
        ))
        db.commit()


def get_db():
    """FastAPI dependency — yields a DB session and closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    Base.metadata.create_all(bind=engine)
