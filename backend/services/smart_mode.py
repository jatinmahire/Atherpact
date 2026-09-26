"""
AetherPact — Phase 13 (Addendum 2): smart-mode anchor-offer suggestion.

A lightweight Thompson-sampling bandit suggests an opening anchor ask based
on a provider's own historical settlements (from the `negotiations` table).
It is purely an editable recommendation for the provider's opening
provider_ask — it never touches the ZOPA settlement itself, which computes
the real clearing_price exactly as before (services.negotiator) regardless
of whether this suggestion was used, edited, or ignored.

With fewer than 3 past settlements for that provider, this returns None —
no suggestion is fabricated from no data.
"""

import random
from typing import Optional, Dict

from sqlalchemy.orm import Session

from database import Negotiation

MIN_PAST_SETTLEMENTS = 3

# Candidate opening-markup "arms": how much above the eventual/likely
# clearing price the provider's opening ask could be set.
MARKUP_ARMS = [0.05, 0.15, 0.25, 0.35]


def _closest_arm(markup: float) -> float:
    return min(MARKUP_ARMS, key=lambda arm: abs(arm - markup))


def suggest_anchor(db: Session, provider_id: str) -> Optional[Dict]:
    """
    Returns {"suggested_anchor": float, "based_on": int, "reason": str} or
    None if this provider has fewer than MIN_PAST_SETTLEMENTS past
    negotiations to learn from.
    """
    past = (
        db.query(Negotiation)
        .filter(Negotiation.provider_id == provider_id)
        .order_by(Negotiation.created_at.desc())
        .limit(200)
        .all()
    )
    settled = [n for n in past if n.status == "settled" and n.clearing_price]
    if len(settled) < MIN_PAST_SETTLEMENTS:
        return None

    # Beta(alpha, beta) posterior per arm, updated from every past negotiation
    # (settled -> reward 1, no_deal -> reward 0) bucketed by its markup.
    alpha = {arm: 1.0 for arm in MARKUP_ARMS}
    beta = {arm: 1.0 for arm in MARKUP_ARMS}

    for n in past:
        if not n.provider_ask or n.provider_ask <= 0:
            continue
        reference_price = n.clearing_price if n.status == "settled" else n.provider_min
        if not reference_price or reference_price <= 0:
            continue
        markup = (n.provider_ask - reference_price) / reference_price
        arm = _closest_arm(markup)
        reward = 1.0 if n.status == "settled" else 0.0
        alpha[arm] += reward
        beta[arm] += (1.0 - reward)

    # Thompson sampling: one posterior sample per arm, pick the best.
    samples = {arm: random.betavariate(alpha[arm], beta[arm]) for arm in MARKUP_ARMS}
    chosen_arm = max(samples, key=samples.get)

    mean_clearing = sum(n.clearing_price for n in settled) / len(settled)
    suggested_anchor = round(mean_clearing * (1 + chosen_arm), 2)

    return {
        "suggested_anchor": suggested_anchor,
        "based_on": len(settled),
        "reason": (
            f"Based on {len(settled)} of your past settlements (avg clearing price "
            f"₹{mean_clearing:,.2f}), a {int(chosen_arm*100)}% opening markup has "
            f"performed best for you so far."
        ),
    }
