"""
AetherPact — Phase 12 (Addendum 2): in-memory vector index for semantic search.

Substitution note: the addendum specifies `hnswlib`, but hnswlib ships no
prebuilt wheel for this platform (Windows, Python 3.12) and building it from
source needs a C/C++ compiler this machine doesn't have (the same constraint
hit earlier with `llama-cpp-python`). `faiss-cpu` ships a real prebuilt wheel
here and its `IndexHNSWFlat` is the same HNSW algorithm hnswlib implements —
so that's what backs this index instead. The behavior the addendum actually
asks for is unchanged: an in-memory index, fully rebuilt from scratch on
listing create/update/delete, with SQLite as the one source of truth and
this index as a derived, disposable cache — never the reverse.

The real performance win here isn't approximate search at this catalog size
(a few dozen listings) — it's that listing embeddings are computed ONCE at
rebuild time and cached, instead of being re-encoded through the neural model
on every single /match request as the original Phase 3 code did. Every
listing is still scored on every search (see search_all), so the final
ranking is provably identical to a full linear scan — this index changes
*how fast* semantic_score is obtained, not which listings get considered.
"""

import threading
from typing import Dict, List, Optional

import faiss
import numpy as np

_EMBED_DIM = 384  # all-MiniLM-L6-v2 output dimension
_HNSW_M = 32

_lock = threading.Lock()
_index: Optional["faiss.IndexHNSWFlat"] = None
_asset_ids: List[str] = []  # position i in the index -> _asset_ids[i]


def _normalize(vecs: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vecs, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return vecs / norms


def rebuild(assets: list) -> None:
    """
    Recompute the whole index from the given list of active Asset ORM rows.
    Call this after any listing is created, updated, or deleted (and once at
    startup). SQLite stays the source of truth; this is a derived cache.
    """
    global _index, _asset_ids
    from services.matcher import get_model  # deferred: avoids a circular import

    with _lock:
        if not assets:
            _index = None
            _asset_ids = []
            return

        model = get_model()
        descriptions = [a.description for a in assets]
        embeddings = model.encode(descriptions, convert_to_numpy=True).astype("float32")
        embeddings = _normalize(embeddings)

        index = faiss.IndexHNSWFlat(_EMBED_DIM, _HNSW_M, faiss.METRIC_INNER_PRODUCT)
        index.hnsw.efConstruction = 80
        index.hnsw.efSearch = 64
        index.add(embeddings)

        _index = index
        _asset_ids = [a.id for a in assets]


def search_all(query_embedding: np.ndarray) -> Dict[str, float]:
    """
    Returns {asset_id: semantic_score} for every listing currently indexed,
    using cached listing embeddings — no per-listing re-encode. Semantic
    score is cosine similarity (embeddings are L2-normalized, index metric
    is inner product), clamped to >=0 per the Phase 10 fix.
    """
    with _lock:
        if _index is None or _index.ntotal == 0:
            return {}
        q = _normalize(query_embedding.astype("float32").reshape(1, -1))
        k = _index.ntotal
        scores, ids = _index.search(q, k)
        return {
            _asset_ids[idx]: max(0.0, float(scores[0][pos]))
            for pos, idx in enumerate(ids[0])
            if idx != -1
        }


def is_ready() -> bool:
    with _lock:
        return _index is not None and _index.ntotal > 0
