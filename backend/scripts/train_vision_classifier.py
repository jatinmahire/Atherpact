"""
AetherPact — Phase 16 (Addendum 2): vision "false alarm vs. real dispute"
classifier, trained on real active-learning triage labels once there are
enough of them.

Uses the tiles saved by routers/audit.py's /audit/{id}/triage endpoint under
data/vision_triage/{false_alarm,dispute_accepted}/ — every tile is a crop a
human reviewer explicitly labeled. Trains a small MobileNetV3 binary
classifier on top of those two real classes.

### MANUAL STEP REQUIRED
This script only writes backend/models_cache/vision_triage_classifier.pt —
it does NOT wire it into services/visual_diff.py's change-detection pipeline.
That's a deliberate, separate step once the classifier's held-out accuracy
has actually been checked.

A minimum-data guard runs first and exits cleanly (no crash, no heavy
imports) when there isn't enough real signal yet.

Usage:
    python scripts/train_vision_classifier.py
"""

import sys
from pathlib import Path

MIN_IMAGES_PER_CLASS = 20

sys.path.insert(0, str(Path(__file__).parent.parent))

TRIAGE_DIR = Path(__file__).parent.parent / "data" / "vision_triage"
CLASSES = ["false_alarm", "dispute_accepted"]


def main() -> None:
    counts = {}
    for label in CLASSES:
        label_dir = TRIAGE_DIR / label
        counts[label] = len(list(label_dir.glob("*.jpg"))) if label_dir.exists() else 0

    if any(counts[label] < MIN_IMAGES_PER_CLASS for label in CLASSES):
        print(
            f"Triage tiles so far: {counts}. Need at least {MIN_IMAGES_PER_CLASS} per "
            "class before a classifier is worthwhile. Exiting cleanly; the OpenCV "
            "contour-based change detection in services/visual_diff.py keeps running "
            "unchanged. Re-run this script later once more disputes have been triaged."
        )
        return

    # Heavy imports deferred until the guard above passes.
    import torch
    from torch import nn
    from torch.utils.data import DataLoader
    from torchvision import datasets, models, transforms

    transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    dataset = datasets.ImageFolder(str(TRIAGE_DIR), transform=transform)
    loader = DataLoader(dataset, batch_size=8, shuffle=True)

    print(f"Training vision triage classifier on {len(dataset)} real labeled tiles…")
    model = models.mobilenet_v3_small(weights="IMAGENET1K_V1")
    model.classifier[-1] = nn.Linear(model.classifier[-1].in_features, len(CLASSES))

    optimizer = torch.optim.Adam(model.parameters(), lr=1e-4)
    criterion = nn.CrossEntropyLoss()

    model.train()
    for epoch in range(5):
        total_loss = 0.0
        for images, labels in loader:
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
        print(f"  epoch {epoch + 1}/5 — loss {total_loss / max(1, len(loader)):.4f}")

    output_path = Path(__file__).parent.parent / "models_cache" / "vision_triage_classifier.pt"
    torch.save(model.state_dict(), output_path)
    print(f"Classifier written to {output_path}. Not yet wired into services/visual_diff.py.")


if __name__ == "__main__":
    main()
