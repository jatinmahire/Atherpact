"""
AetherPact — Phase 4: Negotiation router.
POST /negotiate — ZOPA solver + LLM phrasing + Laya dispute-risk badge.
Phase 13 (Addendum 2): optional multi-round mode + smart-mode anchor suggestion.
"""

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db, Negotiation, Asset, DecisionFlag, User
from models import NegotiateRequest, NegotiateResponse, SmartSuggestionOut
from routers.auth import get_current_user
from services.negotiator import zopa_solve, zopa_solve_multi_round
from services.llm_service import phrase_settlement
from services.laya_service import check_dispute_risk
from services.smart_mode import suggest_anchor
from services.nugen_service import negotiation_domain_insight, classify_city_tier
from services.pricing_service import suggested_rate

router = APIRouter(prefix="/negotiate", tags=["negotiate"])


@router.get("/pricing-suggestion/{asset_id}")
def pricing_suggestion(
    asset_id: str,
    provider_ask: float,
    starts_at: datetime,
    simulation: Optional[str] = Query(None, pattern="^(heavy_rain|heat_wave)$"),
    db: Session = Depends(get_db),
):
    """
    Addendum 10, Phase 74: a small, honestly-new real pricing-suggestion
    feature (no equivalent existed before this phase — see
    services/pricing_service.py's module docstring). `simulation` is the
    frontend's active global Simulation Mode preset, if any.
    """
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return suggested_rate(db, asset, provider_ask, starts_at, simulation)


@router.get("/smart-suggestion/{asset_id}", response_model=SmartSuggestionOut)
def smart_suggestion(asset_id: str, db: Session = Depends(get_db)):
    """
    Phase 13: optional, additive-only anchor-ask suggestion for the provider,
    based on their own past settlements. Never touches the real ZOPA
    settlement. Returns has_suggestion=False (no fabricated number) if this
    provider has fewer than 3 past settlements.
    """
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    result = suggest_anchor(db, asset.owner_id)
    if result is None:
        return SmartSuggestionOut(has_suggestion=False)
    return SmartSuggestionOut(has_suggestion=True, **result)


@router.post("", response_model=NegotiateResponse)
def negotiate(
    req: NegotiateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    asset = db.get(Asset, req.asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    rounds_log = None
    if req.multi_round:
        # ── Phase 13.1: optional multi-round deterministic concession ───────
        status, clearing_price, no_deal_msg, rounds_log = zopa_solve_multi_round(
            provider_ask=req.provider_ask,
            provider_min=req.provider_min,
            seeker_offer=req.seeker_offer,
            seeker_max=req.seeker_max,
        )
    else:
        # ── Phase 4.1: Pure Python ZOPA solver (single-shot) ─────────────────
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

    # ── Addendum 9, Phase 62: Nugen domain-aligned negotiation advisor ───────
    # Advisory only, settled deals only (a no-deal has no price to assess);
    # never blocks or delays the response beyond the run_agent call itself,
    # and returns None (shown as nothing / a fallback note by the frontend)
    # if Nugen is unreachable or no key is configured.
    domain_insight = None
    if status == "settled" and clearing_price is not None:
        domain_insight = negotiation_domain_insight(
            resource_type=asset.category,
            city_tier=classify_city_tier(asset.address),
            clearing_price=clearing_price,
            terms=req.extra_terms,
        )

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
        rounds_log=rounds_log,
        domain_insight=domain_insight,
    )
