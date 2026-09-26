"""
AetherPact — Auth router (register, login, /me).
Uses bcrypt for password hashing and HS256 JWT for session tokens.
"""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from jose import JWTError, jwt
from passlib.context import CryptContext

from database import get_db, User, Referral
from models import RegisterRequest, LoginRequest, TokenResponse, UserOut, ReferralStatusOut

router = APIRouter(prefix="/auth", tags=["auth"])

SECRET_KEY = "aetherpact-dev-secret-change-in-prod"
ALGORITHM  = "HS256"
TOKEN_TTL  = timedelta(hours=12)

pwd_ctx     = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def _hash(pw: str) -> str:
    return pwd_ctx.hash(pw)


def _verify(pw: str, hashed: str) -> bool:
    return pwd_ctx.verify(pw, hashed)


def _make_token(user_id: str) -> str:
    exp = datetime.now(timezone.utc) + TOKEN_TTL
    return jwt.encode({"sub": user_id, "exp": exp}, SECRET_KEY, algorithm=ALGORITHM)


def _generate_referral_code(db: Session) -> str:
    """8-char uppercase code, retried on the rare collision."""
    while True:
        code = uuid.uuid4().hex[:8].upper()
        if not db.query(User).filter(User.referral_code == code).first():
            return code


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if not user_id:
            raise cred_exc
    except JWTError:
        raise cred_exc
    user = db.get(User, user_id)
    if not user:
        raise cred_exc
    return user


@router.post("/register", response_model=TokenResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    if req.role not in ("provider", "seeker", "both"):
        raise HTTPException(status_code=422, detail="role must be provider, seeker, or both")
    referrer = None
    if req.referral_code:
        referrer = db.query(User).filter(User.referral_code == req.referral_code.strip().upper()).first()

    user = User(
        id=str(uuid.uuid4()),
        email=req.email,
        hashed_pw=_hash(req.password),
        display_name=req.display_name,
        role=req.role,
        referral_code=_generate_referral_code(db),
        referred_by=referrer.id if referrer else None,
    )
    db.add(user)
    db.flush()  # user.id needed for the Referral FK before commit

    if referrer:
        db.add(Referral(
            id=str(uuid.uuid4()),
            referrer_id=referrer.id,
            referred_id=user.id,
            credited=False,
        ))

    db.commit()
    return TokenResponse(access_token=_make_token(user.id))


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not _verify(req.password, user.hashed_pw):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return TokenResponse(access_token=_make_token(user.id))


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
