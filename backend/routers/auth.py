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

from database import get_db, User
from models import RegisterRequest, LoginRequest, TokenResponse, UserOut

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
    user = User(
        id=str(uuid.uuid4()),
        email=req.email,
        hashed_pw=_hash(req.password),
        display_name=req.display_name,
        role=req.role,
    )
    db.add(user)
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
