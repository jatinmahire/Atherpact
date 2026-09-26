"""
AetherPact — Reviews router.
POST /reviews — a seeker rates a booking they were party to (1-5, optional comment).
GET  /reviews/{provider_id} — average rating + review list for a provider's assets.

Real, backend-connected review flow closing the LIST -> ... -> VERIFY -> REVIEW loop.
Never fabricated: an empty result set returns average_rating=None, total_reviews=0.
"""

import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db, Rating, Booking, Asset, User
from models import ReviewCreate, ReviewOut, ProviderReviewsOut
from routers.auth import get_current_user

router = APIRouter(tags=["reviews"])


@router.post("/reviews", response_model=ReviewOut)
def create_review(
    req: ReviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    booking = db.get(Booking, req.booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.seeker_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only review your own bookings")

    existing = (
        db.query(Rating)
        .filter(Rating.booking_id == req.booking_id, Rating.rater_id == current_user.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="You've already reviewed this booking")

    rating = Rating(
        id=str(uuid.uuid4()),
        booking_id=req.booking_id,
        rater_id=current_user.id,
        score=req.score,
        comment=req.comment,
    )
    db.add(rating)
    db.commit()
    db.refresh(rating)
    return rating


@router.get("/reviews/{provider_id}", response_model=ProviderReviewsOut)
def get_provider_reviews(provider_id: str, db: Session = Depends(get_db)):
    ratings: List[Rating] = (
        db.query(Rating)
        .join(Booking, Rating.booking_id == Booking.id)
        .join(Asset, Booking.asset_id == Asset.id)
        .filter(Asset.owner_id == provider_id)
        .order_by(Rating.created_at.desc())
        .all()
    )
    total = len(ratings)
    average = round(sum(r.score for r in ratings) / total, 2) if total else None

    return ProviderReviewsOut(
        provider_id=provider_id,
        average_rating=average,
        total_reviews=total,
        reviews=ratings,
    )
