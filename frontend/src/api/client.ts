/**
 * AetherPact — Typed API client (axios).
 * All requests go to FastAPI at localhost:8000 via Vite proxy at /api.
 */

import axios from 'axios'

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT token to every request if present
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('aetherpact_token')
  if (token) {
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
}

export interface Listing {
  id: string
  owner_id: string
  title: string
  description: string
  category: string
  price_per_day: number
  lat: number
  lon: number
  address: string
  capacity: number | null
  is_active: boolean
  created_at: string
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

export interface NegotiateResponse {
  status: 'settled' | 'no_deal'
  clearing_price: number | null
  llm_phrasing: string | null
  extra_terms: string | null
  dispute_risk_badge: string | null
  negotiation_id: string
}

export interface ChatResponse {
  intent: string
  match_results: MatchResultItem[] | null
  fallback_message: string | null
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authAPI = {
  register: (email: string, password: string, display_name: string, role: string) =>
    api.post<{ access_token: string }>('/auth/register', { email, password, display_name, role }),

  login: (email: string, password: string) =>
    api.post<{ access_token: string }>('/auth/login', { email, password }),

  me: () => api.get<User>('/auth/me'),
}

// ─── Listings ─────────────────────────────────────────────────────────────────

export const listingsAPI = {
  list: (category?: string) =>
    api.get<Listing[]>('/listings', { params: category ? { category } : {} }),

  create: (data: Omit<Listing, 'id' | 'owner_id' | 'is_active' | 'created_at'>) =>
    api.post<Listing>('/listings', data),

  get: (id: string) => api.get<Listing>(`/listings/${id}`),

  checkSafety: (description: string) =>
    api.post('/listings/check', { description }),
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
  }) => api.post<NegotiateResponse>('/negotiate', payload),
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
  created_at: string
  asset_title: string | null
}

export const bookingsAPI = {
  create: (data: { asset_id: string; negotiation_id?: string; starts_at: string; ends_at: string }) =>
    api.post<BookingItem>('/bookings', data),

  list: () => api.get<BookingItem[]>('/bookings'),
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export interface AuditEvent {
  id: string
  booking_id: string
  event_type: string
  image_path: string | null
  change_regions: string | null
  alignment_unavailable: boolean
  created_at: string
}

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
}
