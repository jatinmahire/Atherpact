"""
AetherPact — Bookings router.
POST /bookings — create a booking (payment_status starts "pending") with
    hard conflict checking.
GET /bookings — list the current user's bookings.
POST /bookings/{id}/create-order — real Razorpay order for the negotiated
    price (Phase 38, Addendum 4).
POST /bookings/{id}/verify-payment — real server-side signature
    verification; only this can ever mark a booking Paid.
"""

import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db, Booking, Asset, User, MatchingFeedback, PricingHistory, Negotiation, Referral
from routers.auth import get_current_user
from routers.listings import check_no_booking_conflict
from services import razorpay_service

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
    payment_status: str
    created_at: datetime
    asset_title: Optional[str] = None

    class Config:
        from_attributes = True


class CreateOrderResponse(BaseModel):
    order_id: str
    amount: int  # paise, as Razorpay Checkout expects
    currency: str
    key_id: str  # public key, safe to send to the client


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


def _settled_price(db: Session, asset: Asset, negotiation_id: Optional[str]) -> float:
    """The real deal amount for this booking: the negotiated clearing_price
    if one exists, else the listing's own asking price. Shared by
    PricingHistory logging and the Razorpay order amount so both always
    agree on what was actually charged."""
    if negotiation_id:
        neg = db.get(Negotiation, negotiation_id)
        if neg and neg.clearing_price:
            return neg.clearing_price
    return asset.price_per_day


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
        payment_status="pending",
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
    settled_price = _settled_price(db, asset, req.negotiation_id)
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
        payment_status=booking.payment_status,
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
            payment_status=b.payment_status,
            created_at=b.created_at,
            asset_title=asset.title if asset else None,
        ))
    return result


def _get_own_booking(db: Session, booking_id: str, current_user: User) -> Booking:
    booking = db.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.seeker_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your booking")
    return booking


@router.post("/{booking_id}/create-order", response_model=CreateOrderResponse)
def create_order(
    booking_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Real Razorpay Test Mode order for this booking's negotiated price."""
    booking = _get_own_booking(db, booking_id, current_user)
    if booking.payment_status == "paid":
        raise HTTPException(status_code=409, detail="This booking is already paid")

    asset = db.get(Asset, booking.asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    amount = _settled_price(db, asset, booking.negotiation_id)
    order = razorpay_service.create_order(
        amount_rupees=amount,
        receipt=booking.id,
        notes={"booking_id": booking.id, "asset_id": asset.id},
    )
    booking.razorpay_order_id = order["id"]
    db.commit()

    return CreateOrderResponse(
        order_id=order["id"],
        amount=order["amount"],
        currency=order["currency"],
        key_id=os.environ.get("RAZORPAY_KEY_ID", ""),
    )


@router.post("/{booking_id}/verify-payment", response_model=BookingOut)
def verify_payment(
    booking_id: str,
    req: VerifyPaymentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    The ONLY place a booking is ever marked Paid — real server-side HMAC
    SHA256 signature verification (Rule 12). The client-side Checkout
    success callback alone is never sufficient; an invalid signature is
    correctly rejected rather than trusted.
    """
    booking = _get_own_booking(db, booking_id, current_user)
    if booking.razorpay_order_id != req.razorpay_order_id:
        raise HTTPException(status_code=400, detail="Order id does not match this booking")

    if not razorpay_service.verify_signature(
        req.razorpay_order_id, req.razorpay_payment_id, req.razorpay_signature,
    ):
        booking.payment_status = "failed"
        db.commit()
        raise HTTPException(status_code=400, detail="Payment signature verification failed")

    booking.payment_status = "paid"
    booking.razorpay_payment_id = req.razorpay_payment_id
    db.commit()
    db.refresh(booking)

    asset = db.get(Asset, booking.asset_id)
    return BookingOut(
        id=booking.id,
        asset_id=booking.asset_id,
        negotiation_id=booking.negotiation_id,
        seeker_id=booking.seeker_id,
        starts_at=booking.starts_at,
        ends_at=booking.ends_at,
        status=booking.status,
        payment_status=booking.payment_status,
        created_at=booking.created_at,
        asset_title=asset.title if asset else None,
    )
