"""
AetherPact — Phase 4: ZOPA negotiation solver (pure Python, no model).

Policy layer (exact, from spec):
    lower_bound    = max(provider_min, seeker_offer)
    upper_bound    = min(provider_ask, seeker_max)
    if lower_bound > upper_bound → "no_deal"
    clearing_price = round((lower_bound + upper_bound) / 2, 2)

The LLM (Qwen2.5-0.5B via llama-cpp-python) is called ONLY to phrase the already-
computed clearing_price and extra_terms in natural language.  It is given the final
settled price and terms text ONLY — never the original offer, ask, min, or max.
"""

from typing import Tuple, Optional


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
