"""
AetherPact — Provider analytics router.
GET /provider/analytics — real aggregate stats for the current user's own listings.
Never fabricated: zero listings/bookings/reviews yields real zeros, not placeholder numbers.
"""

from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db, Asset, Booking, Rating, User
from models import ProviderAnalyticsOut
from routers.auth import get_current_user

router = APIRouter(prefix="/provider", tags=["analytics"])


@router.get("/analytics", response_model=ProviderAnalyticsOut)
def provider_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    active_listings = (
        db.query(Asset)
        .filter(Asset.owner_id == current_user.id, Asset.is_active == True)
        .count()
    )

    # Naive UTC to match how Booking.ends_at is stored (see the naive-vs-aware
    # bug this exact mismatch caused in listings.py's recurring-rule check).
    now = datetime.utcnow()
    completed_bookings = (
        db.query(Booking)
        .join(Asset, Booking.asset_id == Asset.id)
        .filter(
            Asset.owner_id == current_user.id,
            Booking.status == "confirmed",
            Booking.ends_at < now,
        )
        .count()
    )

    ratings = (
        db.query(Rating)
        .join(Booking, Rating.booking_id == Booking.id)
        .join(Asset, Booking.asset_id == Asset.id)
        .filter(Asset.owner_id == current_user.id)
        .all()
    )
    total_reviews = len(ratings)
    average_rating = round(sum(r.score for r in ratings) / total_reviews, 2) if total_reviews else None

    return ProviderAnalyticsOut(
        active_listings=active_listings,
        completed_bookings=completed_bookings,
        average_rating=average_rating,
        total_reviews=total_reviews,
    )
