"""
AetherPact — Firebase Admin SDK init + ID token verification (Phase 37,
Addendum 4). Firebase Auth now owns account creation and password
verification entirely; this backend only verifies the ID token on every
protected request.
"""

import os
import firebase_admin
from firebase_admin import credentials, auth as firebase_auth

_app = None


def get_app():
    global _app
    if _app is None:
        cred_path = os.environ.get("FIREBASE_SERVICE_ACCOUNT_PATH")
        if not cred_path or not os.path.exists(cred_path):
            raise RuntimeError(
                "FIREBASE_SERVICE_ACCOUNT_PATH is not set or the file doesn't "
                "exist — Firebase Auth cannot verify tokens without a real "
                "service account key. See Addendum 4, Phase 37's manual setup step."
            )
        cred = credentials.Certificate(cred_path)
        _app = firebase_admin.initialize_app(cred)
    return _app


def verify_id_token(token: str) -> dict:
    """Raises firebase_admin.auth.* exceptions on an invalid/expired token —
    callers must catch and translate to a 401, never let one leak as a 500."""
    get_app()
    return firebase_auth.verify_id_token(token)


def ensure_user_exists(uid: str, email: str, password: str, display_name: str) -> None:
    """
    Idempotent: creates a real Firebase account with an explicit uid so it
    lines up with an existing app-level user row (used for seed/demo
    accounts only, so login with the documented demo credentials keeps
    working after this migration). Never raises on "already exists".
    """
    get_app()
    try:
        firebase_auth.get_user(uid)
    except firebase_auth.UserNotFoundError:
        try:
            firebase_auth.create_user(
                uid=uid, email=email, password=password,
                display_name=display_name, email_verified=True,
            )
        except firebase_auth.EmailAlreadyExistsError:
            pass  # a different uid already owns this email — leave it alone


def provision_seed_accounts() -> None:
    """Ensures the two documented demo accounts exist as real Firebase users
    with uids matching their existing `users` table rows, so the demo
    credentials keep working after the Firebase migration."""
    from database import (
        SEED_PROVIDER_ID, SEED_PROVIDER_EMAIL, SEED_PROVIDER_PASSWORD,
        SEED_SEEKER_ID, SEED_SEEKER_EMAIL, SEED_SEEKER_PASSWORD,
    )
    ensure_user_exists(SEED_PROVIDER_ID, SEED_PROVIDER_EMAIL, SEED_PROVIDER_PASSWORD, "AetherPact Demo Provider")
    ensure_user_exists(SEED_SEEKER_ID, SEED_SEEKER_EMAIL, SEED_SEEKER_PASSWORD, "Test Seeker")
