"""
AetherPact — Auth router (Phase 37, Addendum 4).

Firebase Authentication now owns account creation and password verification
entirely. Every protected endpoint expects a real Firebase ID token
(`Authorization: Bearer <token>`), verified here via the Admin SDK. On the
first verified request from a given Firebase uid, the corresponding row in
our own `users` table is upserted, preserving the application-level role
(PROVIDER, SEEKER, BOTH) that Firebase itself has no concept of.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db, User, Referral
from models import ProfileSyncRequest, UserOut, ReferralStatusOut
from services.firebase_service import verify_id_token

router = APIRouter(prefix="/auth", tags=["auth"])

bearer_scheme = HTTPBearer()


def _generate_referral_code(db: Session) -> str:
    """8-char uppercase code, retried on the rare collision."""
    while True:
        code = uuid.uuid4().hex[:8].upper()
        if not db.query(User).filter(User.referral_code == code).first():
            return code


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        decoded = verify_id_token(creds.credentials)
    except Exception:
        raise cred_exc

    uid = decoded.get("uid")
    if not uid:
        raise cred_exc

    user = db.get(User, uid)
    if not user:
        email = decoded.get("email") or f"{uid}@firebase.local"
        user = User(
            id=uid,
            email=email,
            display_name=decoded.get("name") or email.split("@")[0],
            role="both",
            referral_code=_generate_referral_code(db),
        )
        db.add(user)
        try:
            db.commit()
            db.refresh(user)
        except IntegrityError:
            # Another concurrent request for this same brand-new uid (e.g.
            # several components firing right after signup) already won the
            # insert race — roll back this one and use the row it created.
            db.rollback()
            user = db.get(User, uid)
            if not user:
                raise cred_exc
    return user


@router.post("/register", response_model=UserOut)
def complete_profile(
    req: ProfileSyncRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Called once by the frontend right after Firebase account creation, to set
    the application-level profile fields Firebase doesn't track. Safe to
    call again (idempotent) — it just updates display_name/role — but the
    referral link is only ever attached once, on this user's first call.
    """
    current_user.display_name = req.display_name
    if req.role in ("provider", "seeker", "both"):
        current_user.role = req.role

    if req.referral_code and not current_user.referred_by:
        referrer = (
            db.query(User)
            .filter(User.referral_code == req.referral_code.strip().upper())
            .first()
        )
        if referrer and referrer.id != current_user.id:
            current_user.referred_by = referrer.id
            db.add(Referral(
                id=str(uuid.uuid4()),
                referrer_id=referrer.id,
                referred_id=current_user.id,
                credited=False,
            ))

    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/me", response_model=UserOut)
def me(current: User = Depends(get_current_user)):
    return current


@router.get("/referral/status", response_model=ReferralStatusOut)
def referral_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.referral_code:
        # Self-heal for users created before referral codes existed (seed data).
        current_user.referral_code = _generate_referral_code(db)
        db.commit()

    referrals = db.query(Referral).filter(Referral.referrer_id == current_user.id).all()
    return ReferralStatusOut(
        referral_code=current_user.referral_code,
        referral_credit=current_user.referral_credit or 0.0,
        total_referred=len(referrals),
        credited_referrals=sum(1 for r in referrals if r.credited),
    )
