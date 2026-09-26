"""
AetherPact — shared Firebase test helper (Phase 37, Addendum 4).

Every regression suite needs a real Firebase ID token to call protected
endpoints now that Firebase Auth owns account creation. This uses Firebase's
own REST Identity Toolkit API (the same one the JS SDK calls under the
hood) with the project's public web API key — never firebase-admin, since
that's a server-side trust boundary these test scripts shouldn't have.
"""

import os
import requests

_FIREBASE_API_KEY = None


def _get_api_key() -> str:
    global _FIREBASE_API_KEY
    if _FIREBASE_API_KEY:
        return _FIREBASE_API_KEY
    env_path = os.path.join(os.path.dirname(__file__), "..", "frontend", ".env")
    with open(env_path) as f:
        for line in f:
            if line.startswith("VITE_FIREBASE_API_KEY="):
                _FIREBASE_API_KEY = line.strip().split("=", 1)[1]
                return _FIREBASE_API_KEY
    raise RuntimeError("VITE_FIREBASE_API_KEY not found in frontend/.env")


def firebase_id_token(email: str, password: str) -> str:
    """Signs up if the account doesn't exist yet, else signs in. Returns a
    real Firebase ID token, exactly what the frontend's JS SDK would produce."""
    api_key = _get_api_key()
    r = requests.post(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={api_key}",
        json={"email": email, "password": password, "returnSecureToken": True},
    )
    if r.status_code == 400 and "EMAIL_EXISTS" in r.text:
        r = requests.post(
            f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={api_key}",
            json={"email": email, "password": password, "returnSecureToken": True},
        )
    r.raise_for_status()
    return r.json()["idToken"]
