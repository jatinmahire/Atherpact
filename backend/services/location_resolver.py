"""
AetherPact — Phase 36 (Addendum 4): server-side location resolution.

No form anywhere asks a human to type latitude/longitude directly (Rule 14).
Coordinates are derived automatically, either from the browser's geolocation
(raw lat/lon passed straight through) or from a pasted Google Maps link,
resolved here. An unresolvable or unrecognized link never raises — it
degrades to "Location pending" so the listing still saves.
"""

import re
from typing import Optional, TypedDict

import httpx

_FULL_LINK_PATTERNS = [
    re.compile(r"@(-?\d+\.\d+),(-?\d+\.\d+)"),
    re.compile(r"!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)"),
]
_SHORT_LINK_MARKERS = ("maps.app.goo.gl", "goo.gl/maps")


class ResolvedLocation(TypedDict):
    lat: Optional[float]
    lon: Optional[float]
    resolved: bool
    maps_link: Optional[str]


def _extract_coords(url: str) -> Optional[tuple]:
    for pattern in _FULL_LINK_PATTERNS:
        m = pattern.search(url)
        if m:
            return float(m.group(1)), float(m.group(2))
    return None


def resolve_location(
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    maps_link: Optional[str] = None,
) -> ResolvedLocation:
    """
    A pasted maps_link takes priority (the human pointed at a specific place)
    over raw browser coordinates. Never raises.
    """
    if maps_link:
        stripped = maps_link.strip()
        url_to_parse = stripped

        if any(marker in stripped for marker in _SHORT_LINK_MARKERS):
            try:
                resp = httpx.get(stripped, follow_redirects=True, timeout=5.0)
                url_to_parse = str(resp.url)
            except Exception:
                # No connectivity, or the shortener didn't resolve — fall back
                # gracefully rather than failing the whole save.
                return {"lat": None, "lon": None, "resolved": False, "maps_link": stripped}

        coords = _extract_coords(url_to_parse)
        if coords:
            return {"lat": coords[0], "lon": coords[1], "resolved": True, "maps_link": stripped}
        return {"lat": None, "lon": None, "resolved": False, "maps_link": stripped}

    if lat is not None and lon is not None:
        display_link = f"https://www.google.com/maps?q={lat},{lon}"
        return {"lat": lat, "lon": lon, "resolved": True, "maps_link": display_link}

    return {"lat": None, "lon": None, "resolved": False, "maps_link": None}
