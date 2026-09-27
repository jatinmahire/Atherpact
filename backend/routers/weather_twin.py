"""
AetherPact — Addendum 10: Weather Digital Twin endpoint (Phases 68, 69, 71).

GET /api/weather/twin-snapshot[?scenario=heavy_rain|heat_wave] — real
weather (or a fixed, disclosed what-if override), real scoring, and a real
Nugen Agent 3 reasoning response for every active listing with resolved
coordinates. The scenario override never touches the database or any
booking/listing record — it only changes the numbers computed and
returned by this one read-only endpoint.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db, Asset
from services.weather_twin_service import (
    fetch_live_weather,
    fetch_social_signal,
    weather_severity,
    demand_impact,
    dominant_weather_factor,
    resource_type_for_category,
    SCENARIO_PRESETS,
    weather_twin_reasoning,
)

router = APIRouter(prefix="/weather", tags=["weather-twin"])

_KNOWN_CITIES = (
    "mumbai", "delhi", "bengaluru", "bangalore", "chennai", "kolkata",
    "hyderabad", "pune", "ahmedabad", "nagpur",
)


def _extract_city(address: str) -> str:
    lower = (address or "").lower()
    for city in _KNOWN_CITIES:
        if city in lower:
            return city.title()
    return address or "an unspecified location"


@router.get("/twin-snapshot")
def twin_snapshot(
    scenario: str = Query("normal", pattern="^(normal|heavy_rain|heat_wave)$"),
    db: Session = Depends(get_db),
):
    assets = (
        db.query(Asset)
        .filter(Asset.is_active == True, Asset.lat.isnot(None), Asset.lon.isnot(None))
        .all()
    )

    # Several seed/test listings sit at the same or near-identical
    # coordinates — cache the real Open-Meteo fetch per rounded (lat, lon)
    # (~1km precision, more than enough for weather) so this endpoint
    # doesn't repeat an identical live network call per listing.
    weather_cache: dict[tuple[float, float], dict | None] = {}
    # Cache the social-signal + Nugen reasoning calls per (city, weather
    # condition) within this one request, same reasoning.
    cache: dict[str, tuple[str, str | None]] = {}
    results = []

    for asset in assets:
        if scenario == "normal":
            coord_key = (round(asset.lat, 2), round(asset.lon, 2))
            if coord_key not in weather_cache:
                weather_cache[coord_key] = fetch_live_weather(asset.lat, asset.lon)
            weather = weather_cache[coord_key]
            if weather is None:
                # Honest failure — skip this listing rather than fabricate
                # weather data for it.
                continue
        else:
            weather = SCENARIO_PRESETS[scenario]

        severity = weather_severity(weather["precip_prob"], weather["wind_kmh"], weather["temp_c"])
        resource_type = resource_type_for_category(asset.category)
        impact = demand_impact(resource_type, severity)
        dominant_factor = dominant_weather_factor(weather["precip_prob"], weather["wind_kmh"], weather["temp_c"])

        city = _extract_city(asset.address)
        weather_condition = (
            f"precipitation probability {weather['precip_prob']:.0f}%, "
            f"wind {weather['wind_kmh']:.0f} km/h, temperature {weather['temp_c']:.0f}°C"
        )
        cache_key = f"{city}|{weather_condition}"
        if cache_key not in cache:
            social_signal = fetch_social_signal(city)
            reasoning = weather_twin_reasoning(weather_condition, city, social_signal)
            cache[cache_key] = (social_signal, reasoning)
        social_signal, reasoning = cache[cache_key]

        results.append({
            "asset_id": asset.id,
            "title": asset.title,
            "category": asset.category,
            "resource_type": resource_type,
            "lat": asset.lat,
            "lon": asset.lon,
            "weather": weather,
            "severity": severity,
            "demand_impact": impact,
            "dominant_factor": dominant_factor,
            "social_signal": social_signal,
            "reasoning": reasoning,
        })

    return {"scenario": scenario, "listings": results}
