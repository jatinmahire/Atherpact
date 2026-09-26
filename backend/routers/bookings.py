"""
AetherPact — Bookings router.
POST /bookings — create a confirmed booking with hard conflict checking.
GET /bookings — list the current user's bookings.
"""

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db, Booking, Asset, User, MatchingFeedback, PricingHistory, Negotiation, Referral
from routers.auth import get_current_user
from routers.listings import check_no_booking_conflict

router = APIRouter(prefix="/bookings", tags=["bookings"])


class BookingCreate(BaseModel):
    asset_id: str
    negotiation_id: Optional[str] = None
    starts_at: datetime
    ends_at: datetime


class BookingOut(BaseModel):
    id: str
    asset_id: str
    negotiation_id: Optional[str]
    seeker_id: str
    starts_at: datetime
    ends_at: datetime
    status: str
    created_at: datetime
    asset_title: Optional[str] = None

    class Config:
        from_attributes = True


@router.post("", response_model=BookingOut)
def create_booking(
    req: BookingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a confirmed booking with hard conflict checking."""
    asset = db.get(Asset, req.asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    if req.ends_at <= req.starts_at:
        raise HTTPException(status_code=422, detail="ends_at must be after starts_at")

    # Hard conflict check — no overlapping confirmed bookings
    check_no_booking_conflict(db, req.asset_id, req.starts_at, req.ends_at)

    # Phase 17 (Addendum 2): must be checked BEFORE this booking is created/
    # flushed below, otherwise the new row would find itself and this would
    # always be True.
    is_first_booking = (
        db.query(Booking).filter(Booking.seeker_id == current_user.id).first() is None
    )

    booking = Booking(
        id=str(uuid.uuid4()),
        asset_id=req.asset_id,
        negotiation_id=req.negotiation_id,
        seeker_id=current_user.id,
        starts_at=req.starts_at,
        ends_at=req.ends_at,
        status="confirmed",
    )
    db.add(booking)
    db.flush()  # booking.id needed for pricing_history FK before commit

    # Phase 16 (Addendum 2): flip the most recent unbooked MatchingFeedback
    # row for this listing to was_booked=True — a real, if imperfect, signal
    # (most-recent-unflipped heuristic, not exact requirement->booking
    # ground truth) rather than no signal at all.
    feedback = (
        db.query(MatchingFeedback)
        .filter(MatchingFeedback.listing_id == req.asset_id, MatchingFeedback.was_booked == False)
        .order_by(MatchingFeedback.created_at.desc())
        .first()
    )
    if feedback:
        feedback.was_booked = True

    # Phase 16 (Addendum 2): real settled-price history for a later yield-
    # pricing training pass. The live pricing heuristic is untouched by this.
    settled_price = asset.price_per_day
    if req.negotiation_id:
        neg = db.get(Negotiation, req.negotiation_id)
        if neg and neg.clearing_price:
            settled_price = neg.clearing_price
    lead_time_days = max(0, (req.starts_at.replace(tzinfo=None) - datetime.utcnow()).days)
    db.add(PricingHistory(
        id=str(uuid.uuid4()),
        booking_id=booking.id,
        day_of_week=req.starts_at.weekday(),
        lead_time_days=lead_time_days,
        listing_type=asset.category,
        settled_price=settled_price,
    ))

    # Phase 17 (Addendum 2): referral credit on the referred user's FIRST
    # confirmed booking only — a stored ledger number, never real payment.
    if current_user.referred_by:
        if is_first_booking:
            referral = (
                db.query(Referral)
                .filter(Referral.referred_id == current_user.id, Referral.credited == False)
                .first()
            )
            if referral:
                referrer = db.get(User, referral.referrer_id)
                if referrer:
                    referrer.referral_credit = (referrer.referral_credit or 0.0) + 500.0
                    referral.credited = True

    db.commit()
    db.refresh(booking)

    return BookingOut(
        id=booking.id,
        asset_id=booking.asset_id,
        negotiation_id=booking.negotiation_id,
        seeker_id=booking.seeker_id,
        starts_at=booking.starts_at,
        ends_at=booking.ends_at,
        status=booking.status,
        created_at=booking.created_at,
        asset_title=asset.title,
    )


@router.get("", response_model=List[BookingOut])
def list_bookings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the current user's bookings."""
    bookings = (
        db.query(Booking)
        .filter(Booking.seeker_id == current_user.id)
        .order_by(Booking.created_at.desc())
        .all()
    )
    result = []
    for b in bookings:
        asset = db.get(Asset, b.asset_id)
        result.append(BookingOut(
            id=b.id,
            asset_id=b.asset_id,
            negotiation_id=b.negotiation_id,
            seeker_id=b.seeker_id,
            starts_at=b.starts_at,
            ends_at=b.ends_at,
            status=b.status,
            created_at=b.created_at,
            asset_title=asset.title if asset else None,
        ))
    return result
