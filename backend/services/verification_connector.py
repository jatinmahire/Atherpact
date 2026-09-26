"""
AetherPact — Phase 15 (Addendum 2): business/KYC verification connector.

### MANUAL STEP REQUIRED
Real business/identity verification needs a real account with a KYC provider
(e.g. Signzy, HyperVerge, IDfy — any of these offer a sandbox). Until a real
API key is supplied via the KYC_VERIFICATION_API_KEY environment variable,
this connector honestly reports itself as not connected. It is never faked:
no listing or user is ever shown as "Verified" without a real verify() call
having actually succeeded.
"""

import os
from typing import Optional, TypedDict


class VerificationResult(TypedDict):
    verified: bool
    reference_id: Optional[str]


def is_connected() -> bool:
    return bool(os.environ.get("KYC_VERIFICATION_API_KEY"))


def verify_business(business_details: dict) -> VerificationResult:
    """
    Returns {"verified": bool, "reference_id": str|None}. If no real API key is
    configured, always returns verified=False with reference_id=None — this
    is the honest "not connected" state, not a hard block on the provider
    continuing to use the rest of the app unverified.
    """
    if not is_connected():
        return {"verified": False, "reference_id": None}

    # A real implementation would call the configured KYC provider here with
    # business_details and return its real result. Intentionally not stubbed
    # further: there is no real provider account to call yet.
    raise NotImplementedError(
        "KYC_VERIFICATION_API_KEY is set but no real provider integration has "
        "been implemented yet — wire the actual HTTP call here once a specific "
        "provider is chosen."
    )
