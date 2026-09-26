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


# ── Recurring Availability (Phase 12, Addendum 2) ──────────────────────────────

class RecurringAvailabilityRuleCreate(BaseModel):
    day_of_week: int = Field(ge=0, le=6, description="0=Monday ... 6=Sunday")
    start_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$", description="HH:MM, 24h")
    end_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$", description="HH:MM, 24h")
    recurrence_end_date: Optional[datetime] = None


class RecurringAvailabilityRuleOut(BaseModel):
    id: str
    asset_id: str
    day_of_week: int
    start_time: str
    end_time: str
    recurrence_end_date: Optional[datetime]
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
    multi_round: bool = False  # Phase 13 (Addendum 2): opt into the multi-round concession mode


class NegotiationRound(BaseModel):
    round: int
    provider_ask: float
    seeker_offer: float


class NegotiateResponse(BaseModel):
    status: str                    # "settled" | "no_deal"
    clearing_price: Optional[float]
    llm_phrasing: Optional[str]
    extra_terms: Optional[str]
    dispute_risk_badge: Optional[str]  # advisory from Laya (Phase 5)
    negotiation_id: str
    rounds_log: Optional[List[NegotiationRound]] = None  # present only when multi_round=True


class SmartSuggestionOut(BaseModel):
    has_suggestion: bool
    suggested_anchor: Optional[float] = None
    based_on: Optional[int] = None
    reason: Optional[str] = None


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
    triage_labels: Optional[str] = None
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


# ── Audit Triage (Phase 14, Addendum 2) ────────────────────────────────────────

class AuditTriageRequest(BaseModel):
    region_index: int = Field(ge=0)
    label: str = Field(pattern=r"^(false_alarm|dispute_accepted)$")


class AuditTriageResponse(BaseModel):
    audit_log_id: str
    region_index: int
    label: str
    tile_path: str


# ── Reviews ─────────────────────────────────────────────────────────────────────

class ReviewCreate(BaseModel):
    booking_id: str
    score: int = Field(ge=1, le=5)
    comment: Optional[str] = None


class ReviewOut(BaseModel):
    id: str
    booking_id: str
    rater_id: str
    score: int
    comment: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ProviderReviewsOut(BaseModel):
    provider_id: str
    average_rating: Optional[float]
    total_reviews: int
    reviews: List[ReviewOut]


# ── Provider Analytics ──────────────────────────────────────────────────────────

class ProviderAnalyticsOut(BaseModel):
    active_listings: int
    completed_bookings: int
    average_rating: Optional[float]
    total_reviews: int


# ── Contact (Phase 21, Addendum 3) ──────────────────────────────────────────────

class ContactMessageCreate(BaseModel):
    name: str
    business: Optional[str] = None
    email: EmailStr
    phone: Optional[str] = None
    category: str = Field(pattern=r"^(general|booking|negotiation|verification|technical)$")
    message: str = Field(min_length=1)


class ContactMessageOut(BaseModel):
    id: str
    created_at: datetime
