"""
AetherPact — standalone Nugen inference status check.

Run this any time to check, in one shot, whether Nugen's real inference
backend is currently reachable — without a full diagnostic pass. Makes
exactly one real call against an already-created Addendum 9 agent and
prints the result.

Usage (from backend/):
    python scripts/check_nugen_status.py

Background: as of 2026-09-27, agent creation and the Nugen API/auth/db
(per https://status.nugen.in, which reports "Operational" throughout)
all work correctly with the real API key, but the actual inference
backend returns a real 502 Bad Gateway from nginx on both the
agents/run-agents/*/run endpoint and the raw /inference/chat/completions
endpoint — confirmed across multiple real models, not a request-format
bug. That status page does not monitor inference specifically (only
api.nugen.in, its auth, and its db), so it can show fully green while
this is down.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from services.nugen_service import weather_impact_reasoning

if __name__ == "__main__":
    result = weather_impact_reasoning(
        "test condition", "no notable social signal found", "Mumbai"
    )
    if result:
        print("NUGEN INFERENCE: WORKING")
        print(result)
        sys.exit(0)
    else:
        print("NUGEN INFERENCE: STILL DOWN (or NUGEN_API_KEY unset)")
        sys.exit(1)
