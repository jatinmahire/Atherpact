"""
AetherPact — Phase 15 (Addendum 2): insurance quoting connector.

### MANUAL STEP REQUIRED
Real insurance quoting needs a real sandbox account with an insurer or
aggregator (e.g. a commercial-property/short-term-rental insurance API).
Until a real API key is supplied via the INSURANCE_API_KEY environment
variable, this connector honestly reports itself as not connected — the UI
must show "Insurance quoting not yet connected", never a fabricated premium.
"""

import os
from typing import Optional, TypedDict


class InsuranceQuote(TypedDict):
    available: bool
    premium: Optional[float]
    policy_reference: Optional[str]


def is_connected() -> bool:
    return bool(os.environ.get("INSURANCE_API_KEY"))


def get_quote(asset_value: float, duration_hours: float, resource_type: str) -> InsuranceQuote:
    """
    Returns {"available": bool, "premium": float|None, "policy_reference": str|None}.
    If no real API key is configured, available=False and both other fields
    are None — the honest "not connected" state.
    """
    if not is_connected():
        return {"available": False, "premium": None, "policy_reference": None}

    raise NotImplementedError(
        "INSURANCE_API_KEY is set but no real provider integration has been "
        "implemented yet — wire the actual HTTP call here once a specific "
        "insurer/aggregator is chosen."
    )
