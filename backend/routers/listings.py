"""
AetherPact — Listings router.
Phase 2: POST /listings, GET /listings, with hard conflict checking.
"""

import shutil
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import and_, or_, func
from sqlalchemy.orm import Session

from database import get_db, Asset, Booking, RecurringAvailabilityRule, AvailabilityWindow
from models import (
    ListingCreate, ListingOut, RecurringAvailabilityRuleCreate, RecurringAvailabilityRuleOut,
    BundlingSuggestionOut, AvailabilityWindowCreate, AvailabilityWindowOut,
)
from routers.auth import get_current_user
from database import User
from services import vector_index
from services.location_resolver import resolve_location

LISTING_IMAGE_DIR = Path("listing_images")
LISTING_IMAGE_DIR.mkdir(exist_ok=True)


def _rebuild_vector_index(db: Session) -> None:
    """Phase 12 (Addendum 2): keep the in-memory semantic-search index in
    sync whenever the listings table changes. SQLite stays the source of
    truth; this index is a derived, fully rebuildable cache."""
    active_assets = db.query(Asset).filter(Asset.is_active == True).all()
    vector_index.rebuild(active_assets)


def attach_owner_verified(db: Session, assets: List[Asset]) -> List[Asset]:
    """Phase 15 (Addendum 2): stamp each Asset with a real owner_verified flag
    (never fabricated) so ListingOut can show a Verified badge."""
    owner_ids = {a.owner_id for a in assets}
    if not owner_ids:
        return assets
    verified_owner_ids = {
        u.id for u in db.query(User).filter(User.id.in_(owner_ids)).all() if u.verified_at is not None
    }
    for a in assets:
        a.owner_verified = a.owner_id in verified_owner_ids
    return assets

router = APIRouter(prefix="/listings", tags=["listings"])


@router.post("", response_model=ListingOut)
def create_listing(
    req: ListingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new resource listing. Owner is the authenticated user."""
    if current_user.role not in ("provider", "both"):
        raise HTTPException(status_code=403, detail="Only providers can create listings")

    # Phase 36 (Addendum 4): never trust raw-typed lat/lon — resolve from a
    # pasted Google Maps link or browser-geolocation coordinates. An
    # unresolvable link never blocks the save; it just leaves lat/lon null.
    location = resolve_location(lat=req.lat, lon=req.lon, maps_link=req.maps_link)

    asset = Asset(
        id=str(uuid.uuid4()),
        owner_id=current_user.id,
        title=req.title,
        description=req.description,
        category=req.category,
        price_per_day=req.price_per_day,
        lat=location["lat"],
        lon=location["lon"],
        maps_link=location["maps_link"],
        address=req.address,
        capacity=req.capacity,
        owner_display_name=(req.owner_display_name or None),
        is_active=True,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    _rebuild_vector_index(db)
    attach_owner_verified(db, [asset])
    return asset


@router.get("", response_model=List[ListingOut])
def get_listings(
    category: Optional[str] = None,
    active_only: bool = True,
    db: Session = Depends(get_db),
):
    """Return all listings, optionally filtered by category and active status."""
    q = db.query(Asset)
    if active_only:
        q = q.filter(Asset.is_active == True)
    if category:
        q = q.filter(Asset.category == category)
    assets = q.order_by(Asset.created_at.desc()).all()
    return attach_owner_verified(db, assets)


@router.get("/{asset_id}", response_model=ListingOut)
def get_listing(asset_id: str, db: Session = Depends(get_db)):
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    attach_owner_verified(db, [asset])
    return asset


@router.get("/{asset_id}/bundling", response_model=List[BundlingSuggestionOut])
def get_bundling_suggestions(asset_id: str, db: Session = Depends(get_db)):
    """
    Phase 17 (Addendum 2): "you might also need" — real cross-category
    co-occurrence over the Booking table (seekers who booked this asset and
    what else they booked), not a fabricated recommendation. Returns [] when
    there isn't enough booking history yet.
    """
    seeker_ids = [
        row[0] for row in
        db.query(Booking.seeker_id).filter(Booking.asset_id == asset_id).distinct().all()
    ]
    if not seeker_ids:
        return []

    other_bookings = (
        db.query(Booking.asset_id, func.count(Booking.id).label("cnt"))
        .filter(Booking.seeker_id.in_(seeker_ids), Booking.asset_id != asset_id)
        .group_by(Booking.asset_id)
        .order_by(func.count(Booking.id).desc())
        .limit(5)
        .all()
    )
    if not other_bookings:
        return []

    other_asset_ids = [row[0] for row in other_bookings]
    counts = {row[0]: row[1] for row in other_bookings}
    assets = (
        db.query(Asset)
        .filter(Asset.id.in_(other_asset_ids), Asset.is_active == True)
        .all()
    )
    results = [
        BundlingSuggestionOut(
            asset_id=a.id, title=a.title, category=a.category,
            co_occurrence_count=counts[a.id],
        )
        for a in assets
    ]
    results.sort(key=lambda r: r.co_occurrence_count, reverse=True)
    return results


def _find_conflicting_recurring_rule(
    db: Session,
    asset_id: str,
    starts_at: datetime,
    ends_at: datetime,
) -> Optional[RecurringAvailabilityRule]:
    """
    Phase 12 (Addendum 2): checks every day in [starts_at, ends_at) for a
    generated occurrence of one of this asset's recurring rules that overlaps
    the requested window. Returns the first conflicting rule, or None.
    """
    rules = db.query(RecurringAvailabilityRule).filter(
        RecurringAvailabilityRule.asset_id == asset_id
    ).all()
    if not rules:
        return None

    # occ_start/occ_end are constructed fresh per day below; match starts_at's
    # tz-awareness (or lack of it) so the comparison never raises a naive-vs-
    # aware TypeError regardless of how the caller's datetimes were parsed.
    tzinfo = starts_at.tzinfo

    day = starts_at.date()
    last_day = ends_at.date()
    while day <= last_day:
        for rule in rules:
            if rule.recurrence_end_date and day > rule.recurrence_end_date.date():
                continue
            if day.weekday() != rule.day_of_week:
                continue
            sh, sm = map(int, rule.start_time.split(":"))
            eh, em = map(int, rule.end_time.split(":"))
            occ_start = datetime.combine(day, datetime.min.time(), tzinfo=tzinfo).replace(hour=sh, minute=sm)
            occ_end = datetime.combine(day, datetime.min.time(), tzinfo=tzinfo).replace(hour=eh, minute=em)
            if starts_at < occ_end and ends_at > occ_start:
                return rule
        day += timedelta(days=1)
    return None


def check_no_booking_conflict(
    db: Session,
    asset_id: str,
    starts_at: datetime,
    ends_at: datetime,
    exclude_booking_id: Optional[str] = None,
) -> None:
    """
    Hard conflict check: raise 409 if any confirmed booking, OR any recurring
    availability rule's generated occurrence, on this asset overlaps the
    proposed [starts_at, ends_at) window. No exceptions.
    """
    q = db.query(Booking).filter(
        Booking.asset_id == asset_id,
        Booking.status == "confirmed",
        Booking.starts_at < ends_at,
        Booking.ends_at > starts_at,
    )
    if exclude_booking_id:
        q = q.filter(Booking.id != exclude_booking_id)
    if q.first():
        raise HTTPException(
            status_code=409,
            detail=(
                "Booking conflict: this asset is already confirmed for an overlapping "
                "time window. Choose a different time range."
            ),
        )

    conflicting_rule = _find_conflicting_recurring_rule(db, asset_id, starts_at, ends_at)
    if conflicting_rule:
        raise HTTPException(
            status_code=409,
            detail=(
                "Booking conflict: this time overlaps a recurring standing block "
                f"({conflicting_rule.start_time}-{conflicting_rule.end_time} on that weekday). "
                "Choose a different time range."
            ),
        )


@router.post("/{asset_id}/recurring-availability", response_model=RecurringAvailabilityRuleOut)
def create_recurring_availability_rule(
    asset_id: str,
    req: RecurringAvailabilityRuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Provider-facing control for a rule like 'every Tuesday, 14:00 to 18:00'."""
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if asset.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only this listing's owner can set its availability rules")
    if req.start_time >= req.end_time:
        raise HTTPException(status_code=422, detail="start_time must be before end_time")

    rule = RecurringAvailabilityRule(
        id=str(uuid.uuid4()),
        asset_id=asset_id,
        day_of_week=req.day_of_week,
        start_time=req.start_time,
        end_time=req.end_time,
        recurrence_end_date=req.recurrence_end_date,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.get("/{asset_id}/recurring-availability", response_model=List[RecurringAvailabilityRuleOut])
def list_recurring_availability_rules(asset_id: str, db: Session = Depends(get_db)):
    return (
        db.query(RecurringAvailabilityRule)
        .filter(RecurringAvailabilityRule.asset_id == asset_id)
        .order_by(RecurringAvailabilityRule.day_of_week)
        .all()
    )


# ── One-off Availability Windows (Addendum 5) ──────────────────────────────────
# Provider-declared "this asset is available from X to Y" ranges. Purely
# informational for now: booking conflicts are still decided solely by
# check_no_booking_conflict (other confirmed bookings + recurring blocks),
# so this never changes existing booking behavior — it only gives providers
# a real, persisted way to communicate an available date/time range.

@router.post("/{asset_id}/availability-window", response_model=AvailabilityWindowOut)
def create_availability_window(
    asset_id: str,
    req: AvailabilityWindowCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if asset.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only this listing's owner can set its availability")
    if req.ends_at <= req.starts_at:
        raise HTTPException(status_code=422, detail="ends_at must be after starts_at")

    window = AvailabilityWindow(
        id=str(uuid.uuid4()), asset_id=asset_id,
        starts_at=req.starts_at, ends_at=req.ends_at,
    )
    db.add(window)
    db.commit()
    db.refresh(window)
    return window


@router.get("/{asset_id}/availability-window", response_model=List[AvailabilityWindowOut])
def list_availability_windows(asset_id: str, db: Session = Depends(get_db)):
    return (
        db.query(AvailabilityWindow)
        .filter(AvailabilityWindow.asset_id == asset_id)
        .order_by(AvailabilityWindow.starts_at)
        .all()
    )


# ── Listing Photo (Addendum 5 — required for new listings) ─────────────────────

@router.post("/{asset_id}/image", response_model=ListingOut)
async def upload_listing_image(
    asset_id: str,
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if asset.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only this listing's owner can set its photo")

    ext = Path(image.filename or "").suffix or ".jpg"
    filename = f"{asset_id}{ext}"
    dest = LISTING_IMAGE_DIR / filename
    with dest.open("wb") as f:
        shutil.copyfileobj(image.file, f)

    asset.image_path = str(dest)
    db.commit()
    db.refresh(asset)
    attach_owner_verified(db, [asset])
    return asset
