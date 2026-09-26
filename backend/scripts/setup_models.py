"""
AetherPact — one-time model setup.

Downloads the three local AI models this project needs from this repo's own
GitHub Release (not Hugging Face) and unpacks them into backend/models_cache/:

  - qwen2.5-0.5b-instruct-q4_k_m.gguf   (Qwen2.5-0.5B-Instruct, LLM phrasing)
  - all-MiniLM-L6-v2/                   (sentence-transformers, semantic matching)
  - laya/                               (Laya, advisory decision layer)

Safe to re-run: any model already present on disk is skipped. Uses only the
Python standard library, so it can run before `pip install -r requirements.txt`.

Resumable and retried: on a dropped connection (common on slow/flaky wifi),
it resumes with a Range request instead of restarting, and verifies the final
file size against the server's Content-Length before treating it as done —
a silent truncation here would otherwise surface much later as a confusing
"model failed to load" error.

Usage:
    python scripts/setup_models.py
"""

import sys
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

REPO = "jatinmahire/Atherpact"
RELEASE_TAG = "models-v1"
BASE_URL = f"https://github.com/{REPO}/releases/download/{RELEASE_TAG}"

MODELS_CACHE = Path(__file__).parent.parent / "models_cache"

MAX_ATTEMPTS = 6
RETRY_DELAY_SECONDS = 3

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


def _print_progress(done: int, total: int) -> None:
    if total <= 0:
        return
    pct = min(100, done * 100 // total)
    sys.stdout.write(f"\r    {pct:3d}%  ({done / (1024*1024):.1f} / {total / (1024*1024):.1f} MB)")
    sys.stdout.flush()


def _download_with_resume(url: str, dest: Path) -> int:
    """Streams url into dest, resuming from dest's current size via a Range
    request if dest already partially exists from a prior dropped attempt.
    Returns the total expected size reported by the server for this asset."""
    existing = dest.stat().st_size if dest.exists() else 0

    req = urllib.request.Request(url)
    mode = "wb"
    if existing:
        req.add_header("Range", f"bytes={existing}-")
        mode = "ab"

    with urllib.request.urlopen(req, timeout=30) as resp:
        if resp.status == 200:
            # Server ignored our Range request (some CDNs do on redirect) —
            # start over rather than appending to a file we can't trust.
            existing = 0
            mode = "wb"
            total_size = int(resp.headers.get("Content-Length", 0))
        elif resp.status == 206:
            content_range = resp.headers.get("Content-Range", "")
            total_size = int(content_range.split("/")[-1]) if "/" in content_range else 0
        else:
            total_size = int(resp.headers.get("Content-Length", 0)) + existing

        with open(dest, mode) as f:
            downloaded = existing
            while True:
                chunk = resp.read(1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)
                downloaded += len(chunk)
                _print_progress(downloaded, total_size)
    print()
    return total_size


def download_asset(asset: dict) -> None:
    if asset["check_path"].exists():
        print(f"[skip] {asset['check_path'].name} already present")
        return

    MODELS_CACHE.mkdir(parents=True, exist_ok=True)
    url = f"{BASE_URL}/{asset['name']}"
    dest = MODELS_CACHE / asset["name"]

    print(f"[download] {asset['name']} <- {url}")

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            expected_size = _download_with_resume(url, dest)
            actual_size = dest.stat().st_size
            if expected_size and actual_size != expected_size:
                raise IOError(
                    f"size mismatch after download: got {actual_size} bytes, "
                    f"expected {expected_size} bytes (connection likely dropped mid-transfer)"
                )
            break
        except (urllib.error.URLError, OSError) as exc:
            print(f"\n[retry {attempt}/{MAX_ATTEMPTS}] {exc}")
            if attempt == MAX_ATTEMPTS:
                print(
                    f"[error] giving up on {asset['name']} after {MAX_ATTEMPTS} attempts.\n"
                    f"         Check that the release exists at: "
                    f"https://github.com/{REPO}/releases/tag/{RELEASE_TAG}",
                    file=sys.stderr,
                )
                sys.exit(1)
            time.sleep(RETRY_DELAY_SECONDS)

    if asset["is_zip"]:
        print(f"[verify] {asset['name']}")
        with zipfile.ZipFile(dest, "r") as zf:
            bad_file = zf.testzip()
            if bad_file is not None:
                dest.unlink()
                print(
                    f"[error] {asset['name']} is corrupted (bad member: {bad_file}). "
                    "Re-run this script to retry.",
                    file=sys.stderr,
                )
                sys.exit(1)
            print(f"[unzip]  {asset['name']}")
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
