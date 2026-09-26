"""
AetherPact — Listings router.
Phase 2: POST /listings, GET /listings, with hard conflict checking.
"""

import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from database import get_db, Asset, Booking
from models import ListingCreate, ListingOut
from routers.auth import get_current_user
from database import User

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


def check_no_booking_conflict(
    db: Session,
    asset_id: str,
    starts_at: datetime,
    ends_at: datetime,
    exclude_booking_id: Optional[str] = None,
) -> None:
    """
    Hard conflict check: raise 409 if any confirmed booking on this asset overlaps
    the proposed [starts_at, ends_at) window.  No exceptions.
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
