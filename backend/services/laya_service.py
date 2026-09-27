"""
AetherPact — Phase 5: Laya advisory decision layer.

Laya is used for three purely advisory checks:
  1. Chat intent classification  → choice: resource_search | general_question | off_topic_or_spam
  2. Listing safety/compliance   → noul: advisory red-flag note (never a hard block)
  3. Negotiation dispute risk    → noul: risk badge displayed next to clearing_price

Results are stored in decision_flags. Laya NEVER alters a price, blocks a listing,
or overrides a match ranking. Its outputs are always advisory.

If the laya package is unavailable or fails, all checks return safe neutral defaults
so the rest of the application keeps running without interruption.
"""

import logging
import os
from pathlib import Path
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

_LOCAL_LAYA_PATH = Path(__file__).parent.parent / "models_cache" / "laya"

_laya = None
_laya_loaded = False


def _get_laya():
    global _laya, _laya_loaded
    if _laya_loaded:
        return _laya
    _laya_loaded = True
    # Addendum 8, Phase 59: Laya (torch + transformers, ~800MB checkpoint)
    # is by far the heaviest of the three real AI components, and was
    # always designed to be optional — every function below already has a
    # real, honest neutral-default fallback for exactly this case. Setting
    # DISABLE_LAYA=true (e.g. on a free/memory-constrained hosting tier)
    # skips loading it entirely rather than crashing under memory pressure.
    if os.environ.get("DISABLE_LAYA", "").lower() in ("1", "true", "yes"):
        logger.info("Laya disabled via DISABLE_LAYA — advisory checks will use their neutral-default fallback.")
        return None
    try:
        import laya  # type: ignore
        # Prefer the bundled local checkpoint (no Hugging Face Hub cache/symlink
        # machinery involved at all); fall back to the hub id for a dev machine
        # that hasn't bundled it yet.
        source = str(_LOCAL_LAYA_PATH) if _LOCAL_LAYA_PATH.exists() else "convaiinnovations/laya"
        _laya = laya.load(source)
        logger.info("Laya loaded successfully from %s", source)
    except Exception as exc:
        logger.warning("Laya unavailable: %s — advisory checks will return neutral defaults", exc)
        _laya = None
    return _laya


# ─────────────────────────────────────────────────────────────────────────────
# 1. Chat intent routing
# ─────────────────────────────────────────────────────────────────────────────

INTENT_CHOICES = ["resource_search", "general_question", "off_topic_or_spam"]


def classify_chat_intent(message: str) -> Tuple[str, float]:
    """
    Returns (intent_label, confidence).
    Falls back to "resource_search" with confidence 0.5 if Laya is unavailable
    (safe default: let the query proceed rather than silently drop it).
    """
    laya = _get_laya()
    if laya is None:
        return "resource_search", 0.5

    try:
        # Grounding the raw message with domain context measurably improves this small
        # checkpoint's accuracy on short queries (empirically verified) — the criteria
        # alone are not enough signal for it to separate the three classes reliably.
        grounded_state = f'User message to a hospitality resource rental marketplace chatbot: "{message}"'
        result = laya.predict(grounded_state, {
            "intent": {
                "type": "choice",
                "instructions": "Classify what the user is trying to do.",
                "criteria": {
                    "resource_search": "User is describing a hospitality resource they need to rent (kitchen, hall, AV gear, vehicles, event space).",
                    "general_question": "User is asking a general question about how AetherPact works.",
                    "off_topic_or_spam": "Message is unrelated to hospitality resources, or spam/gibberish.",
                },
            }
        })
        answer = result["answers"]["intent"]
        probs  = answer.get("probabilities", {})
        confidence = float(answer.get("confidence", 0.5))

        # This checkpoint's raw argmax is noisy on short/typo'd queries — on real test
        # phrases, "resource_search" and the blocking classes often land within a few
        # points of each other. Blocking a genuine resource request is the worse failure
        # (a silently broken search) than letting an ambiguous message through to /match
        # (which just returns honestly-scored, possibly-irrelevant results). So only
        # override away from resource_search when a blocking class clearly dominates it.
        rs = probs.get("resource_search", 0.0)
        gq = probs.get("general_question", 0.0)
        os_ = probs.get("off_topic_or_spam", 0.0)
        DOMINANCE_MARGIN = 0.15
        if gq > rs and (gq - rs) > DOMINANCE_MARGIN:
            label = "general_question"
        elif os_ > rs and (os_ - rs) > DOMINANCE_MARGIN:
            label = "off_topic_or_spam"
        else:
            label = "resource_search"
        return label, confidence
    except Exception as exc:
        logger.error("Laya intent check error: %s", exc)
        return "resource_search", 0.5


# ─────────────────────────────────────────────────────────────────────────────
# 2. Listing safety / compliance advisory
# ─────────────────────────────────────────────────────────────────────────────

def check_listing_safety(description: str) -> Tuple[bool, float, str]:
    """
    Returns (flagged, confidence, label).
    flagged=True means Laya found a possible red flag — display an advisory note.
    This NEVER prevents publishing.
    """
    laya = _get_laya()
    if laya is None:
        return False, 1.0, "no_flag"

    try:
        result = laya.predict(description, {
            "safety": {
                "type": "noul",
                "instructions": "Does this listing description contain any potentially unsafe, "
                                 "misleading, or legally non-compliant content?",
            }
        })
        answer     = result["answers"]["safety"]
        confidence = float(answer.get("confidence", 0.5))
        flagged    = answer.get("noul", 0.0) > 0.5
        label      = "safety_flag" if flagged else "no_flag"
        return flagged, confidence, label
    except Exception as exc:
        logger.error("Laya listing safety check error: %s", exc)
        return False, 1.0, "no_flag"


# ─────────────────────────────────────────────────────────────────────────────
# 3. Negotiation dispute risk advisory
# ─────────────────────────────────────────────────────────────────────────────

def check_dispute_risk(extra_terms: Optional[str]) -> Tuple[str, float]:
    """
    Returns (risk_badge, confidence): "low_risk" | "medium_risk" | "high_risk".
    Displayed as a badge next to clearing_price — never alters the price.
    Falls back to "low_risk" if Laya is unavailable.
    """
    laya = _get_laya()
    if laya is None or not extra_terms:
        return "low_risk", 1.0

    try:
        result = laya.predict(extra_terms, {
            "risk": {
                "type": "noul",
                "instructions": "Do these negotiation terms contain ambiguous, one-sided, "
                                 "or dispute-prone clauses?",
            }
        })
        answer      = result["answers"]["risk"]
        risk_prob   = float(answer.get("noul", 0.0))
        confidence  = float(answer.get("confidence", 0.5))
        badge = "high_risk" if risk_prob > 0.7 else (
                "medium_risk" if risk_prob > 0.5 else "low_risk"
        )
        return badge, confidence
    except Exception as exc:
        logger.error("Laya dispute risk check error: %s", exc)
        return "low_risk", 1.0
