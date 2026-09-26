"""
AetherPact — Phase 4: ZOPA negotiation solver (pure Python, no model).
Phase 13 (Addendum 2): optional multi-round concession mode, still pure arithmetic.

Policy layer (exact, from spec):
    lower_bound    = max(provider_min, seeker_offer)
    upper_bound    = min(provider_ask, seeker_max)
    if lower_bound > upper_bound → "no_deal"
    clearing_price = round((lower_bound + upper_bound) / 2, 2)

The LLM (Qwen2.5-0.5B via llama-cpp-python) is called ONLY to phrase the already-
computed clearing_price and extra_terms in natural language.  It is given the final
settled price and terms text ONLY — never the original offer, ask, min, or max.
"""

from typing import Tuple, Optional, List, Dict


def zopa_solve(
    provider_ask: float,
    provider_min: float,
    seeker_offer: float,
    seeker_max: float,
) -> Tuple[str, Optional[float], str]:
    """
    Returns (status, clearing_price, explanation_for_no_deal).
    status is "settled" or "no_deal".
    clearing_price is None when status == "no_deal".
    """
    lower_bound = max(provider_min, seeker_offer)
    upper_bound = min(provider_ask, seeker_max)

    if lower_bound > upper_bound:
        gap = lower_bound - upper_bound
        msg = (
            f"No deal: the ranges do not overlap. "
            f"The lowest price the provider will accept (₹{lower_bound:,.2f}) "
            f"exceeds the highest price the seeker will pay (₹{upper_bound:,.2f}) "
            f"by ₹{gap:,.2f}."
        )
        return "no_deal", None, msg

    clearing_price = round((lower_bound + upper_bound) / 2, 2)
    return "settled", clearing_price, ""


def next_offer(current_offer: float, target: float, delta: float = 0.5) -> float:
    """Deterministic linear concession step: moves current_offer a fraction
    delta of the way toward target. Pure arithmetic — no model computes any
    round's number."""
    return current_offer + delta * (target - current_offer)


def zopa_solve_multi_round(
    provider_ask: float,
    provider_min: float,
    seeker_offer: float,
    seeker_max: float,
    delta: float = 0.5,
    max_rounds: int = 3,
    convergence_threshold: Optional[float] = None,
) -> Tuple[str, Optional[float], str, List[Dict]]:
    """
    Optional multi-round mode alongside the single-shot midpoint settlement
    above. Each round, both sides' stated position (provider_ask, seeker_offer)
    moves toward the other by a fixed decay factor delta — pure arithmetic,
    deterministic, no model involved in any round. Runs for up to max_rounds
    or until the gap falls below convergence_threshold, then applies the
    exact same single-shot ZOPA formula to the final round's ask/offer to
    settle. provider_min/seeker_max never move — they're the private
    floor/ceiling throughout, same as the single-shot mode.

    Returns (status, clearing_price, message, rounds_log), where rounds_log
    is [{"round": i, "provider_ask": ..., "seeker_offer": ...}, ...] (round 0
    is the opening position) for a transparent, auditable transcript.
    """
    if convergence_threshold is None:
        convergence_threshold = 0.01 * ((provider_ask + seeker_offer) / 2)

    current_ask = provider_ask
    current_offer = seeker_offer
    rounds_log = [{"round": 0, "provider_ask": round(current_ask, 2), "seeker_offer": round(current_offer, 2)}]

    for i in range(1, max_rounds + 1):
        if (current_ask - current_offer) <= convergence_threshold:
            break
        new_ask = max(next_offer(current_ask, current_offer, delta), provider_min)
        new_offer = min(next_offer(current_offer, current_ask, delta), seeker_max)
        current_ask, current_offer = new_ask, new_offer
        rounds_log.append({"round": i, "provider_ask": round(current_ask, 2), "seeker_offer": round(current_offer, 2)})

    status, clearing_price, msg = zopa_solve(current_ask, provider_min, current_offer, seeker_max)
    return status, clearing_price, msg, rounds_log
