"""
AetherPact — Pydantic request/response models (shared across routers).
"""

from __future__ import annotations
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime


# ── Auth ──────────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    display_name: str
    role: str = "both"          # "provider" | "seeker" | "both"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: str
    email: str
    display_name: str
    role: str
    created_at: datetime

    class Config:
        from_attributes = True


# ── Listings ──────────────────────────────────────────────────────────────────

class ListingCreate(BaseModel):
    title: str
    description: str
    category: str
    price_per_day: float = Field(gt=0)
    lat: float
    lon: float
    address: str
    capacity: Optional[int] = None


class ListingOut(BaseModel):
    id: str
    owner_id: str
    title: str
    description: str
    category: str
    price_per_day: float
    lat: float
    lon: float
    address: str
    capacity: Optional[int]
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ── Match ─────────────────────────────────────────────────────────────────────

class MatchRequest(BaseModel):
    description: str
    budget: float = 0.0
    lat: Optional[float] = None
    lon: Optional[float] = None


class ScoreBreakdown(BaseModel):
    semantic_score: float
    price_score: float
    distance_score: float
    final_score: float


class MatchResultOut(BaseModel):
    asset: ListingOut
    scores: ScoreBreakdown


class MatchResponse(BaseModel):
    results: List[MatchResultOut]
    query: str


# ── Negotiate ─────────────────────────────────────────────────────────────────

class NegotiateRequest(BaseModel):
    asset_id: str
    provider_ask: float = Field(gt=0)
    provider_min: float = Field(gt=0)
    seeker_offer: float = Field(gt=0)
    seeker_max: float = Field(gt=0)
    extra_terms: Optional[str] = None


class NegotiateResponse(BaseModel):
    status: str                    # "settled" | "no_deal"
    clearing_price: Optional[float]
    llm_phrasing: Optional[str]
    extra_terms: Optional[str]
    dispute_risk_badge: Optional[str]  # advisory from Laya (Phase 5)
    negotiation_id: str


# ── Chat / Intent ──────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    budget: float = 0.0
    lat: Optional[float] = None
    lon: Optional[float] = None


class ChatResponse(BaseModel):
    intent: str                         # "resource_search" | "general_question" | "off_topic_or_spam"
    match_results: Optional[List[MatchResultOut]] = None
    fallback_message: Optional[str] = None


# ── Audit ──────────────────────────────────────────────────────────────────────

class AuditEventOut(BaseModel):
    id: str
    booking_id: str
    event_type: str
    image_path: Optional[str]
    change_regions: Optional[str]
    alignment_unavailable: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class AuditSummary(BaseModel):
    booking_id: str
    checkin: Optional[AuditEventOut]
    checkout: Optional[AuditEventOut]
    change_detected: bool
    change_regions: Optional[str]
    alignment_unavailable: bool = False
