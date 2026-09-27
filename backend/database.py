"""
AetherPact — SQLite schema, engine setup, and seed data.
Phase 2: Core Data Model, Listings, and Availability
"""

import math
import hashlib
import os
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    create_engine, Column, String, Float, Integer, Boolean,
    DateTime, Text, ForeignKey, CheckConstraint, event
)
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# Addendum 8, Phase 57: DATABASE_URL is the standard convention Neon (and
# most Postgres hosts) expect. Defaults to a local SQLite file only for
# local development convenience — production always sets this to a real
# hosted Postgres connection string.
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./aetherpact.db")
_IS_SQLITE = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    # check_same_thread is a SQLite-only connect arg — passing it to a
    # Postgres driver (psycopg2) would raise, so it's applied conditionally.
    connect_args={"check_same_thread": False} if _IS_SQLITE else {},
)

if _IS_SQLITE:
    # Enable WAL mode and foreign-key enforcement — SQLite-only pragmas,
    # meaningless (and unavailable) on Postgres, which enforces foreign
    # keys and durable writes by default.
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
    # Phase 37 (Addendum 4): id is now the Firebase uid — Firebase Auth owns
    # account creation and password verification entirely; this row only
    # holds the application-level profile Firebase itself doesn't track.
    id            = Column(String, primary_key=True)
    email         = Column(String, unique=True, nullable=False)
    hashed_pw     = Column(String, nullable=True)  # vestigial post-Firebase-migration, unused
    display_name  = Column(String, nullable=False)
    role          = Column(String, nullable=False)          # "provider" | "seeker" | "both"
    # Phase 85: captured once at registration, real column (not derived from
    # anything). Nullable at the DB level for the same reason `role` defaults
    # to "both" here — get_current_user auto-creates this row on a brand-new
    # Firebase uid's very first authenticated request, before the frontend's
    # own /auth/register call (which is where this is actually required and
    # validated) ever runs.
    contact_phone = Column(String, nullable=True)
    # Phase 15 (Addendum 2): set only by a real verification_connector call once
    # a real KYC provider key exists. Null means "not verified" — never faked.
    verified_at   = Column(DateTime, nullable=True)
    # Phase 17 (Addendum 2): referral loop. code is this user's own shareable
    # code; referred_by is the code they signed up with, if any.
    referral_code   = Column(String, unique=True, nullable=True)
    referred_by     = Column(String, nullable=True)
    referral_credit = Column(Float, default=0.0)  # a stored ledger number only — no real payment behind it
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
    # Phase 112: the real minimum acceptable price for THIS listing, set once
    # by the provider — the negotiation floor Phase 114 enforces server-side.
    # Never exposed on ListingOut (search/listing pages); only ever read
    # through the dedicated negotiation-floor endpoint.
    provider_min  = Column(Float, nullable=False)
    # Phase 36 (Addendum 4): auto-populated only, never a raw human-typed
    # value — nullable because a pasted/short link may fail to resolve.
    lat           = Column(Float, nullable=True)
    lon           = Column(Float, nullable=True)
    maps_link     = Column(String, nullable=True)
    address       = Column(String, nullable=False)
    capacity      = Column(Integer, nullable=True)
    # Addendum 5: a real photo, required for new listings (enforced in the
    # router/frontend, not the column, so pre-existing seed listings without
    # one don't become invalid).
    image_path    = Column(String, nullable=True)
    # Phase 86: optional per-listing contact name (a provider with several
    # listings may have a different on-site contact per item) — distinct
    # from the account-level contact_phone on User. Null when skipped.
    owner_display_name = Column(String, nullable=True)
    # Phase 102: required, listing-specific contact number — what a seeker's
    # booking actually shows, never the account-level contact_phone
    # directly (that's only the defensive fallback, Phase 103).
    listing_contact_phone = Column(String, nullable=False)
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


class RecurringAvailabilityRule(Base):
    """
    Phase 12 (Addendum 2): a standing weekly block for an asset, e.g. "every
    Tuesday, 14:00 to 18:00" (maintenance, an existing standing reservation,
    etc). A one-off booking request that overlaps a generated occurrence of
    this rule is rejected, the same as an overlap with a literal Booking row.
    """
    __tablename__ = "recurring_availability_rules"
    id                  = Column(String, primary_key=True)
    asset_id            = Column(String, ForeignKey("assets.id"), nullable=False)
    day_of_week         = Column(Integer, nullable=False)  # 0=Monday ... 6=Sunday (Python's date.weekday())
    start_time          = Column(String, nullable=False)   # "HH:MM", 24h
    end_time            = Column(String, nullable=False)   # "HH:MM", 24h
    recurrence_end_date = Column(DateTime, nullable=True)  # None = recurs indefinitely
    created_at          = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Requirement(Base):
    """A seeker's posted resource need."""
    __tablename__ = "requirements"
    id          = Column(String, primary_key=True)
    seeker_id   = Column(String, nullable=True)          # nullable — anonymous searches allowed
    description = Column(Text, nullable=False)
    budget      = Column(Float, default=0.0)
    lat         = Column(Float, nullable=True)
    lon         = Column(Float, nullable=True)
    maps_link   = Column(String, nullable=True)  # Phase 36 (Addendum 4)
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
    # Phase 38 (Addendum 4): real Razorpay payment. Never set to "paid" except
    # by a real server-side HMAC signature verification succeeding.
    payment_status     = Column(String, default="pending")  # "pending" | "paid" | "failed"
    razorpay_order_id   = Column(String, nullable=True)
    razorpay_payment_id = Column(String, nullable=True)
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
    # Phase 11 (Addendum 2): True when ORB found too few feature matches to
    # align the pair safely — surfaced honestly rather than silently ignored.
    alignment_unavailable = Column(Boolean, default=False)
    # Phase 14 (Addendum 2): human triage labels for this event's flagged
    # regions, JSON dict {"<region_index>": "false_alarm"|"dispute_accepted"}.
    # Feeds the labeled-data pipeline for a later (not-yet-trained) vision
    # classifier — never trained automatically, never used to change this
    # event's own change_detected result.
    triage_labels  = Column(Text, nullable=True)
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


class ContactMessage(Base):
    """Phase 21 (Addendum 3): real storage for the /contact page submission —
    no fake 'success' toast without an actual row being written."""
    __tablename__ = "contact_messages"
    id          = Column(String, primary_key=True)
    name        = Column(String, nullable=False)
    business    = Column(String, nullable=True)
    email       = Column(String, nullable=False)
    phone       = Column(String, nullable=True)
    category    = Column(String, nullable=False)  # general|booking|negotiation|verification|technical
    message     = Column(Text, nullable=False)
    created_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class MatchingFeedback(Base):
    """Phase 16 (Addendum 2): real (requirement_text, listing_id, was_booked)
    outcomes, logged as real usage accrues. Feeds a later contrastive
    fine-tuning pass (train_finetuned_embeddings.py) — /match keeps using the
    base all-MiniLM-L6-v2 model until a fine-tuned checkpoint is explicitly
    swapped in. was_booked starts False and is flipped True if a booking is
    later made for that listing following this match."""
    __tablename__ = "matching_feedback"
    id                = Column(String, primary_key=True)
    requirement_text  = Column(Text, nullable=False)
    listing_id        = Column(String, ForeignKey("assets.id"), nullable=False)
    was_booked        = Column(Boolean, default=False)
    created_at        = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class PricingHistory(Base):
    """Phase 16 (Addendum 2): real settled-price history for a later
    train_yield_model.py (LightGBM) pass. The live pricing endpoint keeps
    using the existing rule-based heuristic regardless."""
    __tablename__ = "pricing_history"
    id              = Column(String, primary_key=True)
    booking_id      = Column(String, ForeignKey("bookings.id"), nullable=False)
    day_of_week     = Column(Integer, nullable=False)   # 0=Monday
    lead_time_days  = Column(Integer, nullable=False)   # days between booking creation and start
    listing_type    = Column(String, nullable=False)    # asset.category
    settled_price   = Column(Float, nullable=False)
    created_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Referral(Base):
    """Phase 17 (Addendum 2): who referred whom, and whether the stored
    (non-monetary) credit has been awarded yet — awarded on the referred
    user's first completed booking, never before."""
    __tablename__ = "referrals"
    id             = Column(String, primary_key=True)
    referrer_id    = Column(String, ForeignKey("users.id"), nullable=False)
    referred_id    = Column(String, ForeignKey("users.id"), nullable=False)
    credited       = Column(Boolean, default=False)
    created_at     = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class SocialSignalLog(Base):
    """Phase 92: an append-only record of each real Weather Digital Twin
    signal fetch (Phase 91's combined Mastodon + GDELT count) for a city,
    so a real volume trend becomes visible as it accumulates over time —
    never a fabricated historical row."""
    __tablename__ = "social_signal_logs"
    id              = Column(String, primary_key=True)
    city            = Column(String, nullable=False)
    fetched_at      = Column(DateTime, nullable=False)
    combined_count  = Column(Integer, nullable=False)
    mastodon_count  = Column(Integer, nullable=False)
    gdelt_count     = Column(Integer, nullable=False)


# ─────────────────────────────────────────────────────────────────────────────
# Seed Data (5 realistic Mumbai-area hospitality assets)
# ─────────────────────────────────────────────────────────────────────────────

SEED_PROVIDER_ID   = "seed-provider-001"
SEED_PROVIDER_EMAIL = "seedprovider@aetherpact.demo"
SEED_PROVIDER_PASSWORD = "SeedPass123!"

# Phase 37 (Addendum 4): previously created ad hoc by whichever test script
# ran first via the old /auth/register endpoint. Now that account creation
# is Firebase's job, this demo seeker is seeded explicitly here (both the DB
# row below and the matching real Firebase account in main.py's startup)
# so the documented demo credentials keep working.
SEED_SEEKER_ID = "seed-seeker-001"
SEED_SEEKER_EMAIL = "testseeker@demo.com"
SEED_SEEKER_PASSWORD = "Test123!"


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
    """Insert seed users and assets if they don't already exist. Password
    hashing is gone (Phase 37, Addendum 4) — Firebase owns that now; see
    services.firebase_service.provision_seed_accounts for the matching
    real Firebase accounts, called separately at startup."""
    # Seed provider user first, commit so FK is satisfied
    if not db.get(User, SEED_PROVIDER_ID):
        db.add(User(
            id=SEED_PROVIDER_ID,
            email=SEED_PROVIDER_EMAIL,
            display_name="AetherPact Demo Provider",
            role="provider",
            contact_phone="+919876543210",
        ))
        db.commit()  # commit user before assets

    if not db.get(User, SEED_SEEKER_ID):
        db.add(User(
            id=SEED_SEEKER_ID,
            email=SEED_SEEKER_EMAIL,
            display_name="Test Seeker",
            role="both",
            contact_phone="+919876500000",
        ))
        db.commit()

    # Seed assets (FK references user above)
    for data in SEED_ASSETS:
        if not db.get(Asset, data["id"]):
            # Phase 36 (Addendum 4): seed fixtures already have real lat/lon,
            # so derive the same display link create_listing would build.
            # Phase 102: seed listings prefill from the seed provider's own
            # account-level number, same as the real create-listing form does.
            data = {
                **data,
                "maps_link": f"https://www.google.com/maps?q={data['lat']},{data['lon']}",
                "listing_contact_phone": "+919876543210",
                "provider_min": round(data["price_per_day"] * 0.75, 2),
            }
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
