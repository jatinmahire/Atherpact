"""
AetherPact — Bookings router.
POST /bookings — create a confirmed booking with hard conflict checking.
GET /bookings — list the current user's bookings.
"""

import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db, Booking, Asset, User
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
