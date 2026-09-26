"""
AetherPact — Phase 17 (Addendum 2): business-license verification connector.

### MANUAL STEP REQUIRED
A real license lookup (e.g. FSSAI's public registry for commercial kitchens)
needs real API access or scraping permission from that registry. Until a
real key is supplied via the LICENSE_VERIFICATION_API_KEY environment
variable, this connector honestly reports itself as not connected.
"""

import os
from typing import Optional, TypedDict


class LicenseCheckResult(TypedDict):
    valid: Optional[bool]


def is_connected() -> bool:
    return bool(os.environ.get("LICENSE_VERIFICATION_API_KEY"))


def verify_license(registration_number: str) -> LicenseCheckResult:
    if not is_connected():
        return {"valid": None}
    raise NotImplementedError(
        "LICENSE_VERIFICATION_API_KEY is set but no real registry integration "
        "has been implemented yet — wire the actual HTTP call here once a "
        "specific registry (e.g. FSSAI) is chosen."
    )
