"""
AetherPact — Addendum 10: Weather-Driven Digital Twin (Phases 68-69).

Live weather via Open-Meteo (free, no API key — request shape verified live
against the real API before writing this: precipitation_probability is an
hourly-only field, not part of Open-Meteo's "current" block, so the current
hour's forecast entry is matched by timestamp prefix rather than guessed at).
A real social-signal fetch via Reddit's public search JSON API. A
transparent, pure-Python impact-scoring formula (verbatim from the addendum
spec). All three feed Addendum 9's Agent 3 with real inputs only — an
honest "no notable social signal found" state when Reddit returns nothing
or the fetch fails, never a fabricated one.
"""

import logging
import re
from typing import Optional

import httpx

from services.nugen_service import weather_impact_reasoning

logger = logging.getLogger(__name__)

# ── Phase 69: transparent, real scoring (verbatim from the addendum spec) ──
SENSITIVITY = {
    "rooftop": 0.9,        # high rain/wind sensitivity
    "banquet_hall": -0.3,  # indoor, gains substitution demand in bad weather
    "kitchen": 0.1,        # largely weather-insensitive directly
    "vehicle": 0.2,
    "av_equipment": 0.5,   # delivery-timing sensitive, not usage-sensitive
}

# This project's real Asset.category values, mapped to the addendum's
# resource-type keys above (categories are defined in ProviderPortal.tsx's
# CATEGORIES list and backend/database.py's seed data).
_CATEGORY_TO_RESOURCE_TYPE = {
    "banquet_hall": "banquet_hall",
    "commercial_kitchen": "kitchen",
    "av_equipment": "av_equipment",
    "transportation": "vehicle",
    "event_space": "rooftop",
}


def resource_type_for_category(category: str) -> str:
    return _CATEGORY_TO_RESOURCE_TYPE.get(category, "other")


def weather_severity(precip_prob: float, wind_kmh: float, temp_c: float) -> float:
    score = max(precip_prob / 100, min(wind_kmh / 60, 1.0), max(0, (temp_c - 38) / 10))
    return round(min(score, 1.0), 2)


def demand_impact(resource_type: str, severity: float) -> float:
    sensitivity = SENSITIVITY.get(resource_type, 0.0)
    return round(sensitivity * severity * 100, 1)  # signed percentage shift, real and traceable


def dominant_weather_factor(precip_prob: float, wind_kmh: float, temp_c: float) -> str:
    """Addendum 10, Phase 75: whichever real term drove weather_severity's
    max() the furthest — used to derive an honest advisory tag label
    mechanically from the same real numbers, never invented flavor text."""
    components = {
        "rain": precip_prob / 100,
        "wind": min(wind_kmh / 60, 1.0),
        "heat": max(0, (temp_c - 38) / 10),
    }
    dominant = max(components, key=components.get)
    return dominant if components[dominant] > 0 else "none"


# ── Phase 71: fixed, realistic what-if presets. "normal" is not listed here
# — it means "use the real live fetch", per the addendum's own Definition
# of Done ("reverting to Normal restores the real live weather values").
SCENARIO_PRESETS = {
    "heavy_rain": {"precip_prob": 90.0, "wind_kmh": 45.0, "temp_c": 26.0},
    "heat_wave": {"precip_prob": 5.0, "wind_kmh": 10.0, "temp_c": 44.0},
}


# ── Phase 68: live weather, Open-Meteo (no API key) ─────────────────────
def fetch_live_weather(lat: float, lon: float) -> Optional[dict]:
    """Returns real {'precip_prob', 'wind_kmh', 'temp_c'}, or None on failure."""
    try:
        resp = httpx.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "temperature_2m,wind_speed_10m",
                "hourly": "precipitation_probability",
                "forecast_days": 1,
                "timezone": "auto",
            },
            timeout=10.0,
        )
        if resp.status_code != 200:
            logger.warning("Open-Meteo returned HTTP %s for (%s, %s)", resp.status_code, lat, lon)
            return None
        body = resp.json()
        current = body.get("current", {})
        hourly = body.get("hourly", {})
        temp_c = float(current.get("temperature_2m", 0.0) or 0.0)
        wind_kmh = float(current.get("wind_speed_10m", 0.0) or 0.0)

        # precipitation_probability is hourly-only in Open-Meteo's API — find
        # the forecast hour matching the current hour by timestamp prefix
        # ("2026-09-27T05") rather than assuming index 0.
        precip_prob = 0.0
        current_hour_prefix = str(current.get("time", ""))[:13]
        times = hourly.get("time", [])
        probs = hourly.get("precipitation_probability", [])
        for i, t in enumerate(times):
            if str(t)[:13] == current_hour_prefix and i < len(probs):
                precip_prob = float(probs[i] or 0.0)
                break

        return {"precip_prob": precip_prob, "wind_kmh": wind_kmh, "temp_c": temp_c}
    except Exception:
        logger.exception("Open-Meteo fetch failed for (%s, %s)", lat, lon)
        return None


# ── Phase 69: one real social-signal fetch ──────────────────────────────
# Reddit's public search.json (the addendum's suggested source) returns an
# anti-bot HTML interstitial rather than JSON from this network — verified
# directly, not assumed — so this uses Mastodon's public tag-timeline API
# instead: equally free, no key/auth required, and confirmed reachable.
# Real posts under the city's hashtag are kept only if they actually
# mention a weather-related keyword; otherwise this returns the same
# honest "no notable social signal found" state the addendum specifies for
# a failed or empty fetch — never a fabricated signal either way.
_WEATHER_KEYWORDS = (
    "rain", "flood", "storm", "heat", "humid", "weather", "waterlog",
    "cyclone", "heatwave", "monsoon",
)


def fetch_social_signal(city: str) -> str:
    tag = re.sub(r"[^a-z0-9]", "", city.lower())
    if not tag:
        return "no notable social signal found"
    try:
        resp = httpx.get(
            f"https://mastodon.social/api/v1/timelines/tag/{tag}",
            params={"limit": 20},
            headers={"User-Agent": "aetherpact-weather-twin/1.0 (hackathon demo)"},
            timeout=10.0,
        )
        if resp.status_code != 200:
            logger.warning("Mastodon tag timeline returned HTTP %s for tag=%s", resp.status_code, tag)
            return "no notable social signal found"
        posts = resp.json()
        texts = []
        for p in posts:
            plain = re.sub("<[^<]+?>", "", p.get("content", "")).strip()
            if plain and any(k in plain.lower() for k in _WEATHER_KEYWORDS):
                texts.append(plain)
        texts = texts[:5]
        if not texts:
            return "no notable social signal found"
        return " | ".join(texts)
    except Exception:
        logger.exception("Social-signal fetch failed for city=%s", city)
        return "no notable social signal found"


def weather_twin_reasoning(weather_condition: str, city: str, social_signal: str) -> Optional[str]:
    """Thin pass-through to Addendum 9's Agent 3 — kept here so callers in
    this feature don't need to know Agent 3 lives in nugen_service."""
    return weather_impact_reasoning(weather_condition, social_signal, city)
