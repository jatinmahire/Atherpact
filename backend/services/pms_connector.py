"""
AetherPact — Phase 17 (Addendum 2): hotel PMS integration connector.

### MANUAL STEP REQUIRED
Connecting to a real hotel PMS (e.g. Opera PMS, or a smaller property's own
booking system) needs real API access from that PMS's integration/partner
program. Until a real key is supplied via the PMS_API_KEY environment
variable, this connector honestly reports itself as not connected.
"""

import os
from typing import List, TypedDict


class PMSAvailabilitySlot(TypedDict):
    starts_at: str
    ends_at: str


def is_connected() -> bool:
    return bool(os.environ.get("PMS_API_KEY"))


def fetch_availability(provider_id: str) -> List[PMSAvailabilitySlot]:
    """Returns [] when not connected — never fabricated availability data."""
    if not is_connected():
        return []
    raise NotImplementedError(
        "PMS_API_KEY is set but no real PMS integration has been implemented "
        "yet — wire the actual HTTP call here once a specific PMS is chosen."
    )
