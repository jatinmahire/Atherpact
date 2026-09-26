"""
AetherPact — Phase 4: LLM phrasing layer (Qwen2.5-0.5B-Instruct via llama-cpp-python).
Phase 13 (Addendum 2): grammar-constrained decoding for the phrasing schema.

IMPORTANT CONTRACT (spec rule 2):
  - The model receives ONLY the final clearing_price and optional extra_terms.
  - It NEVER receives provider_ask, provider_min, seeker_offer, or seeker_max.
  - It phrases a result; it does not compute one.

Model file location: backend/models_cache/qwen2.5-0.5b-instruct-q4_k_m.gguf
"""

import os
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_MODEL_PATH = Path(__file__).parent.parent / "models_cache" / "qwen2.5-0.5b-instruct-q4_k_m.gguf"
_llm = None  # lazy-loaded on first call

# GBNF grammar: exactly two sentences, each starting with an uppercase letter
# and ending in ./!/? — structurally impossible for the model to emit
# malformed output (extra sentences, no terminator, etc), instead of hoping
# for it and patching with regex afterward.
_TWO_SENTENCE_GRAMMAR = r"""
root ::= sentence " " sentence
sentence ::= [A-Z] middle [.!?]
middle ::= middlechar*
middlechar ::= [^.!?\n]
"""
_grammar = None  # lazy-loaded on first call


def _load_grammar():
    global _grammar
    if _grammar is None:
        from llama_cpp import LlamaGrammar  # type: ignore
        _grammar = LlamaGrammar.from_string(_TWO_SENTENCE_GRAMMAR)
    return _grammar


def _load_llm():
    global _llm
    if _llm is not None:
        return _llm

    if not _MODEL_PATH.exists():
        logger.warning(
            "Qwen2.5 GGUF not found at %s — LLM phrasing unavailable", _MODEL_PATH
        )
        return None

    try:
        from llama_cpp import Llama  # type: ignore
        _llm = Llama(
            model_path=str(_MODEL_PATH),
            n_ctx=512,
            n_threads=4,
            verbose=False,
        )
        logger.info("Qwen2.5-0.5B loaded successfully from %s", _MODEL_PATH)
    except Exception as exc:
        logger.error("Failed to load Qwen2.5: %s", exc)
        _llm = None

    return _llm


def phrase_settlement(clearing_price: float, extra_terms: Optional[str]) -> str:
    """
    Generate a short (1-2 sentence) natural-language phrasing of the settled deal.
    Input to the model: clearing_price + extra_terms only.
    Falls back to a deterministic template if the model is unavailable.
    """
    llm = _load_llm()

    terms_note = f" Additional terms: {extra_terms}." if extra_terms else ""
    prompt = (
        f"<|im_start|>system\n"
        f"You are a helpful assistant that writes brief, professional confirmation messages "
        f"for business deals. Write exactly 1–2 sentences. Be clear and friendly.\n"
        f"<|im_end|>\n"
        f"<|im_start|>user\n"
        f"A deal has been settled at ₹{clearing_price:,.2f} per day.{terms_note} "
        f"Write a short confirmation message.\n"
        f"<|im_end|>\n"
        f"<|im_start|>assistant\n"
    )

    if llm is None:
        # Deterministic fallback — honest, not a fake LLM response
        base = f"Your deal has been settled at ₹{clearing_price:,.2f} per day."
        if extra_terms:
            base += f" Additional terms agreed: {extra_terms}."
        return base

    try:
        grammar = _load_grammar()
        output = llm(
            prompt,
            max_tokens=80,
            temperature=0.5,
            stop=["<|im_end|>", "<|im_start|>"],
            grammar=grammar,
        )
        return output["choices"][0]["text"].strip()
    except Exception as exc:
        logger.error("Qwen2.5 inference error: %s", exc)
        return f"Your deal has been settled at ₹{clearing_price:,.2f} per day."
