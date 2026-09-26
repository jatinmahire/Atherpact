"""
AetherPact — Listings router.
Phase 2: POST /listings, GET /listings, with hard conflict checking.
"""

import uuid
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from database import get_db, Asset, Booking, RecurringAvailabilityRule
from models import ListingCreate, ListingOut, RecurringAvailabilityRuleCreate, RecurringAvailabilityRuleOut
from routers.auth import get_current_user
from database import User
from services import vector_index


def _rebuild_vector_index(db: Session) -> None:
    """Phase 12 (Addendum 2): keep the in-memory semantic-search index in
    sync whenever the listings table changes. SQLite stays the source of
    truth; this index is a derived, fully rebuildable cache."""
    active_assets = db.query(Asset).filter(Asset.is_active == True).all()
    vector_index.rebuild(active_assets)

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
    asset = Asset(
        id=str(uuid.uuid4()),
        owner_id=current_user.id,
        title=req.title,
        description=req.description,
        category=req.category,
        price_per_day=req.price_per_day,
        lat=req.lat,
        lon=req.lon,
        address=req.address,
        capacity=req.capacity,
        is_active=True,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    _rebuild_vector_index(db)
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
    return q.order_by(Asset.created_at.desc()).all()


@router.get("/{asset_id}", response_model=ListingOut)
def get_listing(asset_id: str, db: Session = Depends(get_db)):
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset


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
