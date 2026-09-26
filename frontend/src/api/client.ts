/**
 * AetherPact — Typed API client (axios).
 * All requests go to FastAPI at localhost:8000 via Vite proxy at /api.
 */

import axios from 'axios'
import { auth } from '../lib/firebase'

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Phase 37 (Addendum 4): attach a real, current Firebase ID token to every
// request. getIdToken() also transparently refreshes an expired token, so
// no manual refresh logic is needed here.
api.interceptors.request.use(async (config) => {
  const user = auth.currentUser
  if (user) {
    const token = await user.getIdToken()
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ─── Types ────────────────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  display_name: string
  role: string
  created_at: string
  verified_at: string | null
  referral_code: string | null
  referral_credit: number
}

export interface Listing {
  id: string
  owner_id: string
  title: string
  description: string
  category: string
  price_per_day: number
  lat: number | null
  lon: number | null
  maps_link: string | null
  address: string
  capacity: number | null
  image_path: string | null
  is_active: boolean
  created_at: string
  owner_verified: boolean
}

/** Builds a browsable URL for a stored listing image_path. */
export function listingImageUrl(imagePath: string): string {
  const filename = imagePath.split(/[\\/]/).pop()
  return `/listing_images/${filename}`
}

export interface ListingCreatePayload {
  title: string
  description: string
  category: string
  price_per_day: number
  address: string
  capacity: number | null
  lat?: number
  lon?: number
  maps_link?: string
}

export interface ReferralStatus {
  referral_code: string
  referral_credit: number
  total_referred: number
  credited_referrals: number
}

export interface BundlingSuggestion {
  asset_id: string
  title: string
  category: string
  co_occurrence_count: number
}

export interface ScoreBreakdown {
  semantic_score: number
  price_score: number
  distance_score: number
  final_score: number
}

export interface MatchResultItem {
  asset: Listing
  scores: ScoreBreakdown
}

export interface MatchResponse {
  results: MatchResultItem[]
  query: string
}

export interface NegotiationRound {
  round: number
  provider_ask: number
  seeker_offer: number
}

export interface NegotiateResponse {
  status: 'settled' | 'no_deal'
  clearing_price: number | null
  llm_phrasing: string | null
  extra_terms: string | null
  dispute_risk_badge: string | null
  negotiation_id: string
  rounds_log: NegotiationRound[] | null
}

export interface SmartSuggestion {
  has_suggestion: boolean
  suggested_anchor: number | null
  based_on: number | null
  reason: string | null
}

export interface ChatResponse {
  intent: string
  match_results: MatchResultItem[] | null
  fallback_message: string | null
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authAPI = {
  // Phase 37 (Addendum 4): Firebase itself now creates the account (see
  // Register.tsx) — this call only completes the application-level profile
  // (display_name/role/referral) that Firebase doesn't track, for the
  // already-authenticated Firebase user making the request.
  register: (display_name: string, role: string, referral_code?: string) =>
    api.post<User>('/auth/register', { display_name, role, referral_code }),

  me: () => api.get<User>('/auth/me'),

  referralStatus: () => api.get<ReferralStatus>('/auth/referral/status'),
}

// ─── Listings ─────────────────────────────────────────────────────────────────

export interface RecurringAvailabilityRule {
  id: string
  asset_id: string
  day_of_week: number
  start_time: string
  end_time: string
  recurrence_end_date: string | null
  created_at: string
}

export const listingsAPI = {
  list: (category?: string) =>
    api.get<Listing[]>('/listings', { params: category ? { category } : {} }),

  create: (data: ListingCreatePayload) =>
    api.post<Listing>('/listings', data),

  get: (id: string) => api.get<Listing>(`/listings/${id}`),

  checkSafety: (description: string) =>
    api.post('/listings/check', { description }),

  listRecurringAvailability: (assetId: string) =>
    api.get<RecurringAvailabilityRule[]>(`/listings/${assetId}/recurring-availability`),

  createRecurringAvailability: (assetId: string, rule: { day_of_week: number; start_time: string; end_time: string }) =>
    api.post<RecurringAvailabilityRule>(`/listings/${assetId}/recurring-availability`, rule),

  getBundling: (assetId: string) =>
    api.get<BundlingSuggestion[]>(`/listings/${assetId}/bundling`),

  // Addendum 5
  uploadImage: (assetId: string, file: File) => {
    const formData = new FormData()
    formData.append('image', file)
    return api.post<Listing>(`/listings/${assetId}/image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  listAvailabilityWindows: (assetId: string) =>
    api.get<AvailabilityWindow[]>(`/listings/${assetId}/availability-window`),

  createAvailabilityWindow: (assetId: string, data: { starts_at: string; ends_at: string }) =>
    api.post<AvailabilityWindow>(`/listings/${assetId}/availability-window`, data),
}

export interface AvailabilityWindow {
  id: string
  asset_id: string
  starts_at: string
  ends_at: string
}

// ─── Match ───────────────────────────────────────────────────────────────────

export const matchAPI = {
  match: (description: string, budget: number, lat?: number, lon?: number) =>
    api.post<MatchResponse>('/match', { description, budget, lat, lon }),
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export const chatAPI = {
  send: (message: string, budget = 0, lat?: number, lon?: number) =>
    api.post<ChatResponse>('/chat', { message, budget, lat, lon }),
}

// ─── Negotiate ────────────────────────────────────────────────────────────────

export const negotiateAPI = {
  negotiate: (payload: {
    asset_id: string
    provider_ask: number
    provider_min: number
    seeker_offer: number
    seeker_max: number
    extra_terms?: string
    multi_round?: boolean
  }) => api.post<NegotiateResponse>('/negotiate', payload),

  smartSuggestion: (assetId: string) =>
    api.get<SmartSuggestion>(`/negotiate/smart-suggestion/${assetId}`),
}

// ─── Bookings ────────────────────────────────────────────────────────────────

export interface BookingItem {
  id: string
  asset_id: string
  negotiation_id: string | null
  seeker_id: string
  starts_at: string
  ends_at: string
  status: string
  payment_status: string  // "pending" | "paid" | "failed"
  created_at: string
  asset_title: string | null
}

export interface RazorpayOrder {
  order_id: string
  amount: number  // paise
  currency: string
  key_id: string
}

export const bookingsAPI = {
  create: (data: { asset_id: string; negotiation_id?: string; starts_at: string; ends_at: string }) =>
    api.post<BookingItem>('/bookings', data),

  list: () => api.get<BookingItem[]>('/bookings'),

  // Phase 38 (Addendum 4): real Razorpay payment
  createOrder: (bookingId: string) =>
    api.post<RazorpayOrder>(`/bookings/${bookingId}/create-order`),

  verifyPayment: (bookingId: string, data: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
    api.post<BookingItem>(`/bookings/${bookingId}/verify-payment`, data),

  // Addendum 5: provider's own confirmed deals with the seeker's real date/time
  listProvider: () => api.get<ProviderBookingItem[]>('/bookings/provider'),
}

export interface ProviderBookingItem {
  id: string
  asset_id: string
  asset_title: string | null
  seeker_id: string
  seeker_name: string
  seeker_email: string
  starts_at: string
  ends_at: string
  status: string
  payment_status: string
  created_at: string
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export interface AuditEvent {
  id: string
  booking_id: string
  event_type: string
  image_path: string | null
  change_regions: string | null
  alignment_unavailable: boolean
  triage_labels: string | null
  created_at: string
}

export type TriageLabel = 'false_alarm' | 'dispute_accepted'

export interface AuditSummary {
  booking_id: string
  checkin: AuditEvent | null
  checkout: AuditEvent | null
  change_detected: boolean
  change_regions: string | null
  alignment_unavailable: boolean
}

/** Builds a browsable URL for a stored audit image_path (may contain OS-specific separators). */
export function auditImageUrl(imagePath: string): string {
  const filename = imagePath.split(/[\\/]/).pop()
  return `/audit_images/${filename}`
}

export const auditAPI = {
  checkin: (bookingId: string, image: File) => {
    const form = new FormData()
    form.append('booking_id', bookingId)
    form.append('image', image)
    return api.post<AuditEvent>('/audit/checkin', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  checkout: (bookingId: string, image: File) => {
    const form = new FormData()
    form.append('booking_id', bookingId)
    form.append('image', image)
    return api.post<AuditSummary>('/audit/checkout', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  get: (bookingId: string) =>
    api.get<AuditSummary>(`/audit/${bookingId}`),

  triage: (auditLogId: string, regionIndex: number, label: TriageLabel) =>
    api.post(`/audit/${auditLogId}/triage`, { region_index: regionIndex, label }),
}

// ─── Reviews ─────────────────────────────────────────────────────────────────

export interface Review {
  id: string
  booking_id: string
  rater_id: string
  score: number
  comment: string | null
  created_at: string
}

export interface ProviderReviews {
  provider_id: string
  average_rating: number | null
  total_reviews: number
  reviews: Review[]
}

export const reviewsAPI = {
  create: (bookingId: string, score: number, comment?: string) =>
    api.post<Review>('/reviews', { booking_id: bookingId, score, comment: comment || undefined }),

  getForProvider: (providerId: string) =>
    api.get<ProviderReviews>(`/reviews/${providerId}`),
}

// ─── Provider Analytics ────────────────────────────────────────────────────────

export interface ProviderAnalytics {
  active_listings: number
  completed_bookings: number
  average_rating: number | null
  total_reviews: number
}

export const analyticsAPI = {
  getProviderAnalytics: () => api.get<ProviderAnalytics>('/provider/analytics'),
}

// ─── System Status (offline-first indicator) ──────────────────────────────────

export const systemAPI = {
  health: () => api.get<{ status: string; project: string }>('/health'),
}

// ─── Contact ─────────────────────────────────────────────────────────────────

export interface ContactMessagePayload {
  name: string
  business?: string
  email: string
  phone?: string
  category: 'general' | 'booking' | 'negotiation' | 'verification' | 'technical'
  message: string
}

export const contactAPI = {
  send: (payload: ContactMessagePayload) => api.post<{ id: string; created_at: string }>('/contact', payload),
}
