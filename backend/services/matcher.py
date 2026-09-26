"""
AetherPact — Phase 3: Real Semantic Matching Service.
Phase 10 (Addendum 2): price-fit, semantic clamping, and exponential distance decay fixes.

Scoring formula (exact — never deviate):
  semantic_score  = max(0, cosine_similarity(query_embedding, listing_embedding))
  price_score     = 1.0 if listing.price <= budget, else max(0, 1 - (price-budget)/budget); 0.5 if budget<=0
  distance_score  = exp(-km / 10.0)  (never hard-zeroed past 10 km)
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
    """
    Phase 10 fix: a listing priced under budget is a perfect fit (1.0), not
    penalized the same as one priced over budget by the same absolute gap.
    """
    if budget <= 0:
        return 0.5
    if listing_price <= budget:
        return 1.0
    return max(0.0, 1.0 - ((listing_price - budget) / budget))


_DISTANCE_DECAY_KM = 10.0


def _distance_score(
    req_lat: Optional[float],
    req_lon: Optional[float],
    asset_lat: float,
    asset_lon: float,
) -> float:
    """
    Phase 10 fix: exponential decay instead of a hard linear cutoff — a listing
    12-15 km out (common for peri-urban kitchens/AV depots) now gets a small
    nonzero score instead of being zeroed out entirely past 10 km.
    Returns 0.5 if coords absent.
    """
    if req_lat is None or req_lon is None:
        return 0.5
    km = _haversine_km(req_lat, req_lon, asset_lat, asset_lon)
    return math.exp(-km / _DISTANCE_DECAY_KM)


# ─────────────────────────────────────────────────────────────────────────────
# Public scoring function
# ─────────────────────────────────────────────────────────────────────────────

def _combine_scores(sem: float, price: float, dist: float) -> dict:
    sem, price, dist = round(sem, 3), round(price, 3), round(dist, 3)
    final = round(0.5 * sem + 0.3 * price + 0.2 * dist, 3)
    return {
        "semantic_score":  sem,
        "price_score":     price,
        "distance_score":  dist,
        "final_score":     final,
    }


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
    Compute the full score breakdown for one listing against a query, encoding
    the listing description directly. Kept for any caller without access to
    the Phase 12 cached vector index; rank_listings below uses the faster,
    cached path instead.
    """
    model = get_model()
    listing_emb = model.encode(listing_description, convert_to_numpy=True)
    sem   = max(0.0, _cosine(query_embedding, listing_emb))
    price = _price_score(listing_price, budget)
    dist  = _distance_score(req_lat, req_lon, listing_lat, listing_lon)
    return _combine_scores(sem, price, dist)


def rank_listings(
    query: str,
    listings: list,
    budget: float,
    req_lat: Optional[float],
    req_lon: Optional[float],
    top_k: int = 5,
) -> list:
    """
    Phase 12 (Addendum 2): embed `query` once, look up every listing's cached
    semantic_score from the vector index (services.vector_index) instead of
    re-encoding each listing's description on every request, then apply the
    exact same price/distance/final formula as before over every listing —
    so the final ranking is unchanged, only how semantic_score is obtained.

    Returns the top-k sorted descending by final_score.
    Each item: {"asset": <ORM Asset>, "scores": {semantic_score, ...}}.
    """
    from services import vector_index  # deferred: avoids a circular import

    model = get_model()
    query_emb = model.encode(query, convert_to_numpy=True)
    cached_scores = vector_index.search_all(query_emb) if vector_index.is_ready() else {}

    scored = []
    for asset in listings:
        if asset.id in cached_scores:
            sem = cached_scores[asset.id]
        else:
            # Not yet in the index (e.g. rebuild hasn't run) — fall back to a
            # direct encode so a listing is never silently dropped from ranking.
            listing_emb = model.encode(asset.description, convert_to_numpy=True)
            sem = max(0.0, _cosine(query_emb, listing_emb))

        price = _price_score(asset.price_per_day, budget)
        dist  = _distance_score(req_lat, req_lon, asset.lat, asset.lon)
        scored.append({"asset": asset, "scores": _combine_scores(sem, price, dist)})

    scored.sort(key=lambda x: x["scores"]["final_score"], reverse=True)
    return scored[:top_k]
