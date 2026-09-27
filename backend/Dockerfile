# AetherPact backend — Addendum 8, Phase 56.
# Python base image with build tools available, needed for
# llama-cpp-python's compiled step (confirmed necessary — see README's own
# troubleshooting note about needing a C/C++ compiler + CMake for it).
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first, so this layer only rebuilds when requirements.txt
# actually changes, not on every code edit.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Model pre-download at BUILD time, not request time (Phase 56.5) — so the
# first real user request doesn't stall waiting for a multi-hundred-MB
# download. Safe to re-run; skips any model already present.
RUN python scripts/setup_models.py

# Render (and most hosts) inject the real port via $PORT at runtime — shell
# form is required here so that variable actually expands; the exec-form
# JSON array CMD would pass the literal string "$PORT" instead.
EXPOSE 8000
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
