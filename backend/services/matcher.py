"""
AetherPact — Phase 3: Real Semantic Matching Service.

Scoring formula (exact — never deviate):
  semantic_score  = cosine_similarity(query_embedding, listing_embedding)
  price_score     = max(0, 1 - abs(listing.price - budget) / budget)  if budget > 0  else 0.5
  distance_score  = haversine decay to 0 over 10 km
  final_score     = 0.5*semantic_score + 0.3*price_score + 0.2*distance_score

All scores returned rounded to 3 decimal places.
The model (all-MiniLM-L6-v2) is loaded once at module import time; subsequent calls reuse it.
"""

import math
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np
from sentence_transformers import SentenceTransformer

_MODEL_NAME = "all-MiniLM-L6-v2"
_LOCAL_MODEL_PATH = Path(__file__).parent.parent / "models_cache" / "all-MiniLM-L6-v2"
_model: Optional[SentenceTransformer] = None


def get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        # Prefer the bundled local copy (no Hugging Face network call needed at all);
        # fall back to downloading by name for a dev machine that hasn't bundled it yet.
        source = str(_LOCAL_MODEL_PATH) if _LOCAL_MODEL_PATH.exists() else _MODEL_NAME
        _model = SentenceTransformer(source)
    return _model


# ─────────────────────────────────────────────────────────────────────────────
# Individual score components
# ─────────────────────────────────────────────────────────────────────────────

def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity between two 1-D numpy vectors."""
    denom = (np.linalg.norm(a) * np.linalg.norm(b))
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in km between two (lat, lon) points."""
    R = 6371.0
    φ1, φ2 = math.radians(lat1), math.radians(lat2)
    dφ = math.radians(lat2 - lat1)
    dλ = math.radians(lon2 - lon1)
    a = math.sin(dφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(dλ / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _price_score(listing_price: float, budget: float) -> float:
    if budget <= 0:
        return 0.5
    return max(0.0, 1.0 - abs(listing_price - budget) / budget)


def _distance_score(
    req_lat: Optional[float],
    req_lon: Optional[float],
    asset_lat: float,
    asset_lon: float,
) -> float:
    """Linear decay from 1.0 at 0 km to 0.0 at ≥10 km. Returns 0.5 if coords absent."""
    if req_lat is None or req_lon is None:
        return 0.5
    km = _haversine_km(req_lat, req_lon, asset_lat, asset_lon)
    return max(0.0, 1.0 - km / 10.0)


# ─────────────────────────────────────────────────────────────────────────────
# Public scoring function
# ─────────────────────────────────────────────────────────────────────────────

def score_listing(
    query_embedding: np.ndarray,
    listing_description: str,
    listing_price: float,
    listing_lat: float,
    listing_lon: float,
    budget: float,
    req_lat: Optional[float],
    req_lon: Optional[float],
) -> dict:
    """
    Compute the full score breakdown for one listing against a query.
    Returns a dict with semantic_score, price_score, distance_score, final_score
    all rounded to 3 decimal places.
    """
    model = get_model()
    listing_emb = model.encode(listing_description, convert_to_numpy=True)

    sem   = round(_cosine(query_embedding, listing_emb), 3)
    price = round(_price_score(listing_price, budget), 3)
    dist  = round(_distance_score(req_lat, req_lon, listing_lat, listing_lon), 3)
    final = round(0.5 * sem + 0.3 * price + 0.2 * dist, 3)

    return {
        "semantic_score":  sem,
        "price_score":     price,
        "distance_score":  dist,
        "final_score":     final,
    }


def rank_listings(
    query: str,
    listings: list,
    budget: float,
    req_lat: Optional[float],
    req_lon: Optional[float],
    top_k: int = 5,
) -> list:
    """
    Embed `query`, score every listing, return the top-k sorted descending by final_score.
    Each item: {"asset": <ORM Asset>, "scores": {semantic_score, ...}}.
    """
    model = get_model()
    query_emb = model.encode(query, convert_to_numpy=True)

    scored = []
    for asset in listings:
        scores = score_listing(
            query_embedding=query_emb,
            listing_description=asset.description,
            listing_price=asset.price_per_day,
            listing_lat=asset.lat,
            listing_lon=asset.lon,
            budget=budget,
            req_lat=req_lat,
            req_lon=req_lon,
        )
        scored.append({"asset": asset, "scores": scores})

    scored.sort(key=lambda x: x["scores"]["final_score"], reverse=True)
    return scored[:top_k]
