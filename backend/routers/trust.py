"""
AetherPact — Trust & Compliance Connectors router (Phase 15, Addendum 2)
+ Provider Integrations (Phase 17, Addendum 2).

Every endpoint here is honest about connector state: with no real API key
configured, they return connected=False / available=False rather than a
fabricated success. None of this ever blocks the core marketplace flow.
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from database import get_db, User
from models import (
    VerificationStatusOut, InsuranceQuoteRequest, InsuranceQuoteOut,
    PMSStatusOut, LicenseVerificationRequest, LicenseVerificationOut,
)
from routers.auth import get_current_user
from services import verification_connector, insurance_connector, pms_connector, license_verification_connector

router = APIRouter(tags=["trust"])


@router.get("/verification/status/{user_id}", response_model=VerificationStatusOut)
def verification_status(user_id: str, db: Session = Depends(get_db)):
    """Public: lets a listing card/detail page show a real Verified badge —
    or honestly show nothing — for any provider."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    connected = verification_connector.is_connected()
    return VerificationStatusOut(
        connected=connected,
        verified=user.verified_at is not None,
        verified_at=user.verified_at,
        message="Verification not yet connected" if not connected else (
            "Verified" if user.verified_at else "Not verified"
        ),
    )


@router.post("/verification/request", response_model=VerificationStatusOut)
def request_verification(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Attempts real verification for the current user's own account. With no
    real KYC key configured, honestly reports not connected and lets the
    provider continue unverified rather than blocking them."""
    if not verification_connector.is_connected():
        return VerificationStatusOut(
            connected=False, verified=current_user.verified_at is not None,
            verified_at=current_user.verified_at,
            message="Verification not yet connected — you can keep using AetherPact unverified.",
        )

    result = verification_connector.verify_business({
        "business_name": current_user.display_name, "email": current_user.email,
    })
    if result["verified"]:
        current_user.verified_at = datetime.now(timezone.utc)
        db.commit()
    return VerificationStatusOut(
        connected=True, verified=current_user.verified_at is not None,
        verified_at=current_user.verified_at,
        message="Verified" if result["verified"] else "Verification did not succeed",
    )


@router.post("/insurance/quote", response_model=InsuranceQuoteOut)
def insurance_quote(
    req: InsuranceQuoteRequest,
    current_user: User = Depends(get_current_user),
):
    if not insurance_connector.is_connected():
        return InsuranceQuoteOut(
            available=False, premium=None, policy_reference=None,
            message="Insurance quoting not yet connected",
        )
    result = insurance_connector.get_quote(req.asset_value, req.duration_hours, req.resource_type)
    return InsuranceQuoteOut(
        available=result["available"], premium=result["premium"],
        policy_reference=result["policy_reference"],
        message="Quote generated" if result["available"] else "Insurance quoting not yet connected",
    )


@router.get("/pms/status", response_model=PMSStatusOut)
def pms_status(current_user: User = Depends(get_current_user)):
    connected = pms_connector.is_connected()
    return PMSStatusOut(connected=connected, message="Not connected" if not connected else "Connected")


@router.post("/license/verify", response_model=LicenseVerificationOut)
def verify_license(req: LicenseVerificationRequest, current_user: User = Depends(get_current_user)):
    if not license_verification_connector.is_connected():
        return LicenseVerificationOut(connected=False, valid=None, message="Not connected")
    result = license_verification_connector.verify_license(req.registration_number)
    return LicenseVerificationOut(connected=True, valid=result["valid"], message="Checked")
