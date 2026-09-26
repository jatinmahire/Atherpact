"""
AetherPact — Phase 4: Negotiation router.
POST /negotiate — ZOPA solver + LLM phrasing + Laya dispute-risk badge.
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db, Negotiation, Asset, DecisionFlag, User
from models import NegotiateRequest, NegotiateResponse
from routers.auth import get_current_user
from services.negotiator import zopa_solve
from services.llm_service import phrase_settlement
from services.laya_service import check_dispute_risk

router = APIRouter(prefix="/negotiate", tags=["negotiate"])


@router.post("", response_model=NegotiateResponse)
def negotiate(
    req: NegotiateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    asset = db.get(Asset, req.asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # ── Phase 4.1: Pure Python ZOPA solver ───────────────────────────────────
    status, clearing_price, no_deal_msg = zopa_solve(
        provider_ask=req.provider_ask,
        provider_min=req.provider_min,
        seeker_offer=req.seeker_offer,
        seeker_max=req.seeker_max,
    )

    # ── Phase 4.2: LLM phrasing (settled only) ───────────────────────────────
    llm_text = None
    if status == "settled":
        # Model receives ONLY clearing_price + extra_terms — never the offer/ask/min/max
        llm_text = phrase_settlement(clearing_price, req.extra_terms)
    else:
        llm_text = no_deal_msg

    # ── Phase 5: Laya dispute-risk badge (advisory) ───────────────────────────
    risk_badge, risk_conf = check_dispute_risk(req.extra_terms)

    neg_id = str(uuid.uuid4())

    # Persist negotiation record
    neg = Negotiation(
        id=neg_id,
        asset_id=req.asset_id,
        provider_id=asset.owner_id,
        seeker_id=current_user.id,
        provider_ask=req.provider_ask,
        provider_min=req.provider_min,
        seeker_offer=req.seeker_offer,
        seeker_max=req.seeker_max,
        clearing_price=clearing_price,
        status=status,
        llm_phrasing=llm_text,
        extra_terms=req.extra_terms,
    )
    db.add(neg)

    # Persist Laya advisory flag
    db.add(DecisionFlag(
        id=str(uuid.uuid4()),
        context="negotiation",
        ref_id=neg_id,
        flag_type="dispute_risk",
        label=risk_badge,
        confidence=risk_conf,
        is_advisory=True,
    ))
    db.commit()

    return NegotiateResponse(
        status=status,
        clearing_price=clearing_price,
        llm_phrasing=llm_text,
        extra_terms=req.extra_terms,
        dispute_risk_badge=risk_badge,
        negotiation_id=neg_id,
    )
