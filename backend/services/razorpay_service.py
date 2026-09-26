"""
AetherPact — Razorpay payment integration (Phase 38, Addendum 4).

Real Test Mode payments only — never a simulated/fake payment state. A
booking is marked Paid only after a real server-side HMAC SHA256 signature
verification succeeds; the client-side Checkout success callback alone is
never sufficient (Rule 12).
"""

import os
import razorpay

_client = None


def get_client() -> razorpay.Client:
    global _client
    if _client is None:
        key_id = os.environ.get("RAZORPAY_KEY_ID")
        key_secret = os.environ.get("RAZORPAY_KEY_SECRET")
        if not key_id or not key_secret:
            raise RuntimeError(
                "RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET are not set — Razorpay "
                "cannot create orders or verify payments without them. See "
                "Addendum 4, Phase 38's manual setup step."
            )
        _client = razorpay.Client(auth=(key_id, key_secret))
    return _client


def create_order(amount_rupees: float, receipt: str, notes: dict) -> dict:
    """amount_rupees is converted to paise (Razorpay's smallest unit)."""
    client = get_client()
    return client.order.create({
        "amount": int(round(amount_rupees * 100)),
        "currency": "INR",
        "receipt": receipt,
        "notes": notes,
    })


def verify_signature(order_id: str, payment_id: str, signature: str) -> bool:
    """Never trust the client-side success callback alone — this is the one
    real check. Returns False on any failure rather than raising, so callers
    always get a clean reject instead of a 500."""
    client = get_client()
    try:
        client.utility.verify_payment_signature({
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": signature,
        })
        return True
    except razorpay.errors.SignatureVerificationError:
        return False
