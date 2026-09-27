"""
AetherPact — Addendum 10: Weather Digital Twin endpoint.
Phases 68/69/71 (live weather, real scoring, what-if override), extended by
Phases 91-96: a second real signal source with visible evidence, a real
numeric severity bump from combined signal volume, a continuous
severity/duration/location simulation (replacing the old 2 fixed presets),
and a real live-vs-simulated comparison per listing so the frontend can
build the before/after delta panel and propagation summary from the exact
same numbers the map uses.

GET /api/weather/twin-snapshot never touches the database except to append
a Phase 92 signal-fetch log row — no booking/listing record is ever written.
"""

from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional

from database import get_db, Asset
from services.weather_twin_service import (
    fetch_live_weather,
    fetch_combined_signal,
    log_signal_fetch,
    weather_severity,
    demand_impact,
    dominant_weather_factor,
    resource_type_for_category,
    weather_for_intensity,
    duration_multiplier,
    apply_signal_severity_bump,
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
    scenario: str = Query("normal", pattern="^(normal|custom)$"),
    weather_type: str = Query("rain", pattern="^(rain|heat)$"),
    intensity: float = Query(90.0, ge=0.0, le=100.0),
    duration_hours: float = Query(24.0, ge=0.0, le=168.0),
    location_scope: Optional[str] = Query(None, description="City name; simulation applies only here, everywhere else stays real live weather"),
    db: Session = Depends(get_db),
):
    assets = (
        db.query(Asset)
        .filter(Asset.is_active == True, Asset.lat.isnot(None), Asset.lon.isnot(None))
        .all()
    )

    dur_mult = duration_multiplier(duration_hours) if scenario == "custom" else 1.0
    sim_weather = weather_for_intensity(weather_type, intensity) if scenario == "custom" else None

    # Fetch every unique coordinate's live weather and every unique city's
    # real combined signal CONCURRENTLY, rather than one asset at a time —
    # a sequential loop here means N real network calls in series, which is
    # what made this endpoint take 80+ seconds once Open-Meteo's free tier
    # started rate-limiting mid-session (confirmed live, not a hypothetical).
    asset_city = {asset.id: _extract_city(asset.address) for asset in assets}
    unique_coords = {(round(a.lat, 2), round(a.lon, 2)) for a in assets}
    unique_cities = set(asset_city.values())

    with ThreadPoolExecutor(max_workers=max(1, len(unique_coords) + len(unique_cities))) as pool:
        weather_futures = {pool.submit(fetch_live_weather, lat, lon): (lat, lon) for lat, lon in unique_coords}
        signal_futures = {pool.submit(fetch_combined_signal, city): city for city in unique_cities}

        weather_cache: dict[tuple[float, float], dict | None] = {
            coord: fut.result() for fut, coord in weather_futures.items()
        }
        signal_cache: dict[str, dict] = {
            city: fut.result() for fut, city in signal_futures.items()
        }

    for city, signal in signal_cache.items():
        log_signal_fetch(db, city, signal["combined_count"], signal["mastodon_count"], signal["gdelt_count"])

    reasoning_cache: dict[str, str | None] = {}
    results = []

    for asset in assets:
        coord_key = (round(asset.lat, 2), round(asset.lon, 2))
        live_weather = weather_cache[coord_key]
        city = asset_city[asset.id]
        signal = signal_cache[city]

        # Phase 93: simulation only applies where location_scope allows it —
        # everything else always shows real live weather, untouched.
        in_scope = scenario == "custom" and (not location_scope or city.lower() == location_scope.lower())

        if live_weather is None and not in_scope:
            # A live-only listing with no real weather to show — honest
            # failure, skip rather than fabricate (unchanged from before
            # Phase 91-96). A listing INSIDE an active simulation's scope
            # is not skipped just because Open-Meteo's free tier is
            # rate-limited — the simulated view never depended on it, only
            # the live-comparison baseline does (handled below).
            continue

        resource_type = resource_type_for_category(asset.category)

        # Real live-weather baseline (Phase 95's "before"), with Phase 92's
        # signal bump applied — computed whenever the real fetch actually
        # succeeded. `None` when it didn't (e.g. rate-limited), rather than
        # fabricating one — the frontend treats a null live_demand_impact
        # as "not available" instead of a real 0.
        if live_weather is not None:
            live_severity_base = weather_severity(live_weather["precip_prob"], live_weather["wind_kmh"], live_weather["temp_c"])
            live_severity, live_bumped = apply_signal_severity_bump(live_severity_base, signal["combined_count"])
            live_impact = demand_impact(resource_type, live_severity, duration_multiplier=1.0)
        else:
            live_impact = None

        if in_scope:
            sim_severity_base = weather_severity(sim_weather["precip_prob"], sim_weather["wind_kmh"], sim_weather["temp_c"])
            sim_severity, sim_bumped = apply_signal_severity_bump(sim_severity_base, signal["combined_count"])
            sim_impact = demand_impact(resource_type, sim_severity, duration_multiplier=dur_mult)

            displayed_weather = sim_weather
            displayed_severity_base = sim_severity_base
            displayed_severity = sim_severity
            displayed_bumped = sim_bumped
            displayed_impact = sim_impact
            is_simulated = True
        else:
            displayed_weather = live_weather
            displayed_severity_base = live_severity_base
            displayed_severity = live_severity
            displayed_bumped = live_bumped
            displayed_impact = live_impact
            is_simulated = False

        dominant_factor = dominant_weather_factor(
            displayed_weather["precip_prob"], displayed_weather["wind_kmh"], displayed_weather["temp_c"],
        )

        weather_condition = (
            f"precipitation probability {displayed_weather['precip_prob']:.0f}%, "
            f"wind {displayed_weather['wind_kmh']:.0f} km/h, temperature {displayed_weather['temp_c']:.0f}°C"
        )
        reasoning_key = f"{city}|{weather_condition}"
        if reasoning_key not in reasoning_cache:
            reasoning_cache[reasoning_key] = weather_twin_reasoning(weather_condition, city, signal["summary_text"])
        reasoning = reasoning_cache[reasoning_key]

        results.append({
            "asset_id": asset.id,
            "title": asset.title,
            "category": asset.category,
            "resource_type": resource_type,
            "lat": asset.lat,
            "lon": asset.lon,
            "weather": displayed_weather,
            "is_simulated": is_simulated,
            "severity_base": displayed_severity_base,
            "severity": displayed_severity,
            "signal_bump_applied": displayed_bumped,
            "duration_multiplier": dur_mult if is_simulated else 1.0,
            "demand_impact": displayed_impact,
            "live_demand_impact": live_impact,
            "dominant_factor": dominant_factor,
            "social_signal": signal,
            "reasoning": reasoning,
        })

    return {
        "scenario": scenario,
        "weather_type": weather_type,
        "intensity": intensity,
        "duration_hours": duration_hours,
        "location_scope": location_scope,
        "listings": results,
    }
