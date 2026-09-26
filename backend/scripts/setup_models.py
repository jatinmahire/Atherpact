"""
AetherPact — one-time model setup.

Downloads the three local AI models this project needs from this repo's own
GitHub Release (not Hugging Face) and unpacks them into backend/models_cache/:

  - qwen2.5-0.5b-instruct-q4_k_m.gguf   (Qwen2.5-0.5B-Instruct, LLM phrasing)
  - all-MiniLM-L6-v2/                   (sentence-transformers, semantic matching)
  - laya/                               (Laya, advisory decision layer)

Safe to re-run: any model already present on disk is skipped. Uses only the
Python standard library, so it can run before `pip install -r requirements.txt`.

Usage:
    python scripts/setup_models.py
"""

import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

REPO = "jatinmahire/Atherpact"
RELEASE_TAG = "models-v1"
BASE_URL = f"https://github.com/{REPO}/releases/download/{RELEASE_TAG}"

MODELS_CACHE = Path(__file__).parent.parent / "models_cache"

ASSETS = [
    {
        "name": "qwen2.5-0.5b-instruct-q4_k_m.gguf",
        "check_path": MODELS_CACHE / "qwen2.5-0.5b-instruct-q4_k_m.gguf",
        "is_zip": False,
    },
    {
        "name": "all-MiniLM-L6-v2.zip",
        "check_path": MODELS_CACHE / "all-MiniLM-L6-v2",
        "is_zip": True,
    },
    {
        "name": "laya-checkpoint.zip",
        "check_path": MODELS_CACHE / "laya",
        "is_zip": True,
    },
]


def _progress(block_num: int, block_size: int, total_size: int) -> None:
    if total_size <= 0:
        return
    downloaded = block_num * block_size
    pct = min(100, downloaded * 100 // total_size)
    mb_done = downloaded / (1024 * 1024)
    mb_total = total_size / (1024 * 1024)
    sys.stdout.write(f"\r    {pct:3d}%  ({mb_done:.1f} / {mb_total:.1f} MB)")
    sys.stdout.flush()


def download_asset(asset: dict) -> None:
    if asset["check_path"].exists():
        print(f"[skip] {asset['check_path'].name} already present")
        return

    MODELS_CACHE.mkdir(parents=True, exist_ok=True)
    url = f"{BASE_URL}/{asset['name']}"
    dest = MODELS_CACHE / asset["name"]

    print(f"[download] {asset['name']} <- {url}")
    try:
        urllib.request.urlretrieve(url, dest, reporthook=_progress)
        print()
    except Exception as exc:
        print(f"\n[error] failed to download {asset['name']}: {exc}", file=sys.stderr)
        print(
            "         Check that the release exists at: "
            f"https://github.com/{REPO}/releases/tag/{RELEASE_TAG}",
            file=sys.stderr,
        )
        sys.exit(1)

    if asset["is_zip"]:
        print(f"[unzip]  {asset['name']}")
        with zipfile.ZipFile(dest, "r") as zf:
            zf.extractall(MODELS_CACHE)
        dest.unlink()

    print(f"[done]   {asset['check_path'].name}")


def main() -> None:
    print(f"AetherPact model setup — downloading from {BASE_URL}\n")
    for asset in ASSETS:
        download_asset(asset)
    print("\nAll models present. You can now start the backend.")


if __name__ == "__main__":
    main()
