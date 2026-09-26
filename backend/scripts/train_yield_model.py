"""
AetherPact — Phase 16 (Addendum 2): yield/pricing model, trained on real
settled prices once there's enough of them.

Uses PricingHistory rows (day_of_week, lead_time_days, listing_type,
settled_price) logged by every real booking in bookings.py. Trains a small
LightGBM regressor predicting settled_price from the other three fields —
a candidate signal for a future dynamic-pricing suggestion, not something
that overrides the current price_per_day on its own.

### MANUAL STEP REQUIRED
This script only writes backend/models_cache/yield_model.txt — it does NOT
wire any dynamic-pricing suggestion into listings.py or the frontend. That's
a deliberate, separate step once this model has been evaluated on held-out
data and is known to produce sane suggestions.

A minimum-data guard runs first and exits cleanly (no crash, no heavy
imports) when there isn't enough real signal yet.

Usage:
    python scripts/train_yield_model.py
"""

import sys
from pathlib import Path

MIN_ROWS = 50

sys.path.insert(0, str(Path(__file__).parent.parent))


def main() -> None:
    from database import SessionLocal, PricingHistory

    with SessionLocal() as db:
        rows = db.query(PricingHistory).all()

    if len(rows) < MIN_ROWS:
        print(
            f"Only {len(rows)} settled-price rows logged so far — need at least "
            f"{MIN_ROWS} before a yield model is worthwhile. Exiting cleanly; "
            "pricing stays exactly as providers set it. Re-run this script later "
            "once more real bookings have accrued."
        )
        return

    # Heavy imports deferred until the guard above passes.
    import lightgbm as lgb
    import pandas as pd

    df = pd.DataFrame([
        {
            "day_of_week": r.day_of_week,
            "lead_time_days": r.lead_time_days,
            "listing_type": r.listing_type,
            "settled_price": r.settled_price,
        }
        for r in rows
    ])
    df["listing_type"] = df["listing_type"].astype("category")

    train_data = lgb.Dataset(
        df[["day_of_week", "lead_time_days", "listing_type"]],
        label=df["settled_price"],
        categorical_feature=["listing_type"],
    )

    print(f"Training yield model on {len(df)} real settled-price rows…")
    model = lgb.train(
        params={"objective": "regression", "metric": "mae", "verbosity": -1},
        train_set=train_data,
        num_boost_round=100,
    )

    output_path = Path(__file__).parent.parent / "models_cache" / "yield_model.txt"
    model.save_model(str(output_path))
    print(f"Yield model written to {output_path}. Not yet wired into any pricing suggestion.")


if __name__ == "__main__":
    main()
