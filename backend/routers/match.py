"""
AetherPact — Phase 3: Match router.
POST /match — semantic + price + distance ranking of active listings.
POST /chat  — Laya intent routing + optional /match call.
"""

import uuid
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db, Asset, Requirement, MatchResult, MatchingFeedback
from models import MatchRequest, MatchResponse, MatchResultOut, ScoreBreakdown
from services.matcher import rank_listings
from routers.listings import attach_owner_verified

router = APIRouter(tags=["match"])


@router.post("/match", response_model=MatchResponse)
def match(req: MatchRequest, db: Session = Depends(get_db)):
    """
    Embed the seeker's free-text requirement, score every active listing using the
    exact formula in Phase 3, and return the top 5 sorted descending by final_score.
    """
    # Persist the requirement for audit purposes
    requirement = Requirement(
        id=str(uuid.uuid4()),
        seeker_id=None,   # anonymous when no auth
        description=req.description,
        budget=req.budget,
        lat=req.lat,
        lon=req.lon,
    )
    db.add(requirement)
    db.flush()  # flush so requirement.id exists in DB before match_results FK

    listings: List[Asset] = db.query(Asset).filter(Asset.is_active == True).all()
    if not listings:
        db.commit()
        return MatchResponse(results=[], query=req.description)

    ranked = rank_listings(
        query=req.description,
        listings=listings,
        budget=req.budget,
        req_lat=req.lat,
        req_lon=req.lon,
    )

    attach_owner_verified(db, [item["asset"] for item in ranked])

    # Persist match results
    results_out = []
    for item in ranked:
        asset = item["asset"]
        scores = item["scores"]

        mr = MatchResult(
            id=str(uuid.uuid4()),
            requirement_id=requirement.id,
            asset_id=asset.id,
            semantic_score=scores["semantic_score"],
            price_score=scores["price_score"],
            distance_score=scores["distance_score"],
            final_score=scores["final_score"],
        )
        db.add(mr)

        # Phase 16 (Addendum 2): real (requirement_text, listing_id, was_booked)
        # logging as usage accrues — feeds a later fine-tuning pass; was_booked
        # starts False and is flipped True in bookings.py if this listing is
        # subsequently booked. /match itself keeps using the base model.
        db.add(MatchingFeedback(
            id=str(uuid.uuid4()),
            requirement_text=req.description,
            listing_id=asset.id,
            was_booked=False,
        ))

        results_out.append(
            MatchResultOut(
                asset=asset,
                scores=ScoreBreakdown(**scores),
            )
        )

    db.commit()
    return MatchResponse(results=results_out, query=req.description)
