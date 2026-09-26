"""
AetherPact — Phase 16 (Addendum 2): fine-tune the semantic matcher on real
usage data once there's enough of it.

Uses MatchingFeedback rows (requirement_text, listing_id, was_booked) logged
by every /match call and flipped to was_booked=True by bookings.py. Booked
(requirement, listing) pairs are treated as positive examples for a
contrastive fine-tune of all-MiniLM-L6-v2 on top of the base checkpoint.

### MANUAL STEP REQUIRED
This script only runs the fine-tune and writes a new checkpoint to
backend/models_cache/all-MiniLM-L6-v2-finetuned/ — it does NOT wire that
checkpoint into services/matcher.py. Swapping the model path in matcher.py
is a deliberate, separate step once a fine-tuned checkpoint has actually
been evaluated and is known to help, not something to automate blindly.

A minimum-data guard runs first and exits cleanly (no crash, no heavy
imports) when there isn't enough real signal yet.

Usage:
    python scripts/train_finetuned_embeddings.py
"""

import sys
from pathlib import Path

MIN_POSITIVE_PAIRS = 50

sys.path.insert(0, str(Path(__file__).parent.parent))


def main() -> None:
    from database import SessionLocal, MatchingFeedback

    with SessionLocal() as db:
        positive_pairs = (
            db.query(MatchingFeedback)
            .filter(MatchingFeedback.was_booked == True)
            .all()
        )

    if len(positive_pairs) < MIN_POSITIVE_PAIRS:
        print(
            f"Only {len(positive_pairs)} booked (requirement, listing) pairs logged so far "
            f"— need at least {MIN_POSITIVE_PAIRS} before a fine-tune is worthwhile. "
            "Exiting cleanly; the base all-MiniLM-L6-v2 model keeps serving /match. "
            "Re-run this script later once more real bookings have accrued."
        )
        return

    # Heavy imports deferred until the guard above passes.
    from database import Asset
    from sentence_transformers import SentenceTransformer, InputExample, losses
    from torch.utils.data import DataLoader

    with SessionLocal() as db:
        examples = []
        for fb in positive_pairs:
            asset = db.get(Asset, fb.listing_id)
            if not asset:
                continue
            listing_text = f"{asset.title}. {asset.description}"
            examples.append(InputExample(texts=[fb.requirement_text, listing_text]))

    if len(examples) < MIN_POSITIVE_PAIRS:
        print(
            f"Only {len(examples)} pairs still resolve to a live listing "
            f"— need at least {MIN_POSITIVE_PAIRS}. Exiting cleanly."
        )
        return

    base_model_path = Path(__file__).parent.parent / "models_cache" / "all-MiniLM-L6-v2"
    output_path = Path(__file__).parent.parent / "models_cache" / "all-MiniLM-L6-v2-finetuned"

    print(f"Fine-tuning on {len(examples)} real booked (requirement, listing) pairs…")
    model = SentenceTransformer(str(base_model_path))
    train_loader = DataLoader(examples, shuffle=True, batch_size=8)
    train_loss = losses.MultipleNegativesRankingLoss(model)
    model.fit(
        train_objectives=[(train_loader, train_loss)],
        epochs=3,
        warmup_steps=int(0.1 * len(train_loader)),
        output_path=str(output_path),
        show_progress_bar=True,
    )
    print(f"Fine-tuned checkpoint written to {output_path}. Not yet wired into services/matcher.py.")


if __name__ == "__main__":
    main()
