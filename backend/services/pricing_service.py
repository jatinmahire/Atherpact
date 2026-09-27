"""
AetherPact — Addendum 10, Phase 74: a small, honestly-new real pricing-
suggestion formula. No equivalent "day/lead-time/demand" pricing formula
existed anywhere in this codebase before this phase — confirmed by an
exhaustive grep across the whole repository before writing this file. The
only prior pricing-related code was `scripts/train_yield_model.py`, an
explicitly unwired LightGBM training script.

Every factor here is computed from real, observable data:
- day_multiplier: the real day-of-week of the requested booking start.
- lead_time_discount: the real gap (in days) between now and that date.
- demand_factor: this specific asset's real past-booking count.
- weather_multiplier: the real Phase 69 demand_impact function, fed by
  either live weather or the active global simulation preset — reused
  exactly, not rewritten.
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from database import Booking
from services.weather_twin_service import (
    fetch_live_weather,
    weather_severity,
    demand_impact,
    resource_type_for_category,
    SCENARIO_PRESETS,
    weather_for_intensity,
)

# Fri/Sat carry a real weekend premium common to event/hospitality rentals;
# Sunday a smaller one. Monday=0 .. Sunday=6 (Python's datetime.weekday()).
_WEEKEND_DAY_MULTIPLIER = {4: 1.15, 5: 1.15, 6: 1.05}

_LAST_MINUTE_PREMIUM = 1.10   # booking starts in under 2 days
_ADVANCE_DISCOUNT = 0.95      # booking starts more than 14 days out
_LAST_MINUTE_DAYS = 2
_ADVANCE_DAYS = 14

_DEMAND_FACTOR_PER_BOOKING = 0.02
_DEMAND_FACTOR_CAP = 0.20


def day_multiplier(starts_at: datetime) -> float:
    return _WEEKEND_DAY_MULTIPLIER.get(starts_at.weekday(), 1.0)


def lead_time_discount(starts_at: datetime, now: datetime) -> float:
    lead_days = (starts_at - now).days
    if lead_days < _LAST_MINUTE_DAYS:
        return _LAST_MINUTE_PREMIUM
    if lead_days > _ADVANCE_DAYS:
        return _ADVANCE_DISCOUNT
    return 1.0


def demand_factor(db: Session, asset_id: str) -> float:
    booking_count = db.query(Booking).filter(Booking.asset_id == asset_id).count()
    return round(1.0 + min(booking_count * _DEMAND_FACTOR_PER_BOOKING, _DEMAND_FACTOR_CAP), 3)


def weather_multiplier_for(asset, simulation: str | None) -> tuple[float, dict | None]:
    """Reuses Phase 69's real demand_impact function exactly, per the
    addendum: weather_multiplier = 1 + (demand_impact / 100). `simulation`
    is the active global Simulation Mode preset, if any — never a locally
    invented override."""
    if simulation and simulation in SCENARIO_PRESETS:
        preset = SCENARIO_PRESETS[simulation]
        weather = weather_for_intensity(preset["weather_type"], preset["intensity"])
    elif asset.lat is not None and asset.lon is not None:
        weather = fetch_live_weather(asset.lat, asset.lon)
    else:
        weather = None

    if weather is None:
        return 1.0, None

    severity = weather_severity(weather["precip_prob"], weather["wind_kmh"], weather["temp_c"])
    resource_type = resource_type_for_category(asset.category)
    impact = demand_impact(resource_type, severity)
    multiplier = round(1 + impact / 100, 3)
    return multiplier, {"weather": weather, "severity": severity, "demand_impact": impact}


def suggested_rate(db: Session, asset, provider_ask: float, starts_at: datetime, simulation: str | None) -> dict:
    now = datetime.now(starts_at.tzinfo) if starts_at.tzinfo else datetime.utcnow()
    dm = day_multiplier(starts_at)
    ltd = lead_time_discount(starts_at, now)
    df = demand_factor(db, asset.id)
    wm, weather_context = weather_multiplier_for(asset, simulation)

    rate = round(provider_ask * dm * ltd * df * wm, 2)

    explanation = f"Based on day ({dm}×), lead time ({ltd}×) and current demand ({df}×)"
    if abs(wm - 1) > 0.02:
        explanation += f", and current weather conditions ({wm}×)"

    return {
        "base_rate": provider_ask,
        "day_multiplier": dm,
        "lead_time_discount": ltd,
        "demand_factor": df,
        "weather_multiplier": wm,
        "suggested_rate": rate,
        "explanation": explanation,
        "weather_context": weather_context,
    }
