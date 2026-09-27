"""
AetherPact — Phase 5: Laya routing for chat widget.
POST /chat — intent classification → /match or fallback.
POST /listings/check — advisory safety flag on new listing descriptions.
"""

import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db, DecisionFlag
from models import (
    ChatRequest, ChatResponse, MatchRequest, MatchResultOut, ScoreBreakdown
)
from services.laya_service import classify_chat_intent, check_listing_safety
from services.matcher import rank_listings
from services.nugen_service import listing_domain_compliance_review
from database import Asset

router = APIRouter(tags=["laya"])


@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest, db: Session = Depends(get_db)):
    """
    Classify the user's message via Laya.
    - resource_search  → run /match and return results
    - general_question → helpful fallback explaining what AetherPact does
    - off_topic_or_spam → polite off-topic response
    """
    intent, confidence = classify_chat_intent(req.message)

    # Persist the decision flag
    flag_id = str(uuid.uuid4())
    db.add(DecisionFlag(
        id=flag_id,
        context="chat",
        ref_id=flag_id,
        flag_type="intent",
        label=intent,
        confidence=confidence,
        is_advisory=True,
    ))
    db.commit()

    if intent == "resource_search":
        listings = db.query(Asset).filter(Asset.is_active == True).all()
        ranked = rank_listings(
            query=req.message,
            listings=listings,
            budget=req.budget,
            req_lat=req.lat,
            req_lon=req.lon,
        )
        results = [
            MatchResultOut(asset=item["asset"], scores=ScoreBreakdown(**item["scores"]))
            for item in ranked
        ]
        return ChatResponse(intent=intent, match_results=results)

    elif intent == "general_question":
        return ChatResponse(
            intent=intent,
            fallback_message=(
                "AetherPact connects hospitality businesses that need resources with those "
                "that have idle capacity. Try asking something like: "
                "\"I need a commercial kitchen in Bandra for 3 days under ₹15,000 per day.\""
            ),
        )
    else:
        return ChatResponse(
            intent=intent,
            fallback_message=(
                "I'm here to help you find or list hospitality resources. "
                "Please ask about kitchens, halls, equipment, vehicles, or event spaces."
            ),
        )


@router.post("/listings/check")
def check_listing(payload: dict, db: Session = Depends(get_db)):
    """
    Advisory safety check on a listing description before publishing.
    Returns an advisory note if Laya flags something — never blocks the listing.

    Addendum 9, Phase 63: also runs the Nugen domain-aligned compliance
    reviewer alongside Laya's own quick check, labeled distinctly on the
    frontend. Both stay advisory; neither ever blocks publishing.
    """
    description = payload.get("description", "")
    category = payload.get("category", "")
    flagged, confidence, label = check_listing_safety(description)

    ref_id = str(uuid.uuid4())
    db.add(DecisionFlag(
        id=ref_id,
        context="listing",
        ref_id=ref_id,
        flag_type="safety",
        label=label,
        confidence=confidence,
        is_advisory=True,
    ))
    db.commit()

    domain_review = listing_domain_compliance_review(category, description) if description else None

    return {
        "flagged": flagged,
        "confidence": round(confidence, 3),
        "label": label,
        "advisory_note": (
            "⚠️ Our content advisor flagged this description for possible compliance issues. "
            "You may still publish — this is an advisory note only."
            if flagged else None
        ),
        "domain_review": domain_review,
    }
