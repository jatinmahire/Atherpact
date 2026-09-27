/**
 * AetherPact — Negotiate & Settle view.
 * Shows real clearing_price prominently, LLM phrasing, and Laya dispute-risk badge.
 * Visually separated so it's clear which parts are deterministic and which advisory.
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Info, Sparkles, Repeat, CreditCard, TrendingUp, Truck, Phone } from 'lucide-react'
import { negotiateAPI, bookingsAPI } from '../api/client'
import type { MatchResultItem, NegotiateResponse, SmartSuggestion, PricingSuggestion } from '../api/client'
import { openRazorpayCheckout } from '../lib/razorpay'
import { authStore } from '../store/auth'
import { useCountUp } from '../hooks/useCountUp'
import NugenBadge from '../components/NugenBadge'
import { simulationStore } from '../store/simulation'

// Addendum 10, Phase 76: deliverable resource categories get a real
// delivery-risk line on the post-payment Confirm & Fulfill step; venue-
// type categories (kitchen, hall, rooftop) don't get delivered anywhere.
const DELIVERABLE_CATEGORIES = new Set(['av_equipment', 'transportation'])

type PaymentState = 'idle' | 'creating_booking' | 'creating_order' | 'awaiting_payment' | 'verifying' | 'paid' | 'failed'

const PAYMENT_STATE_LABEL: Record<PaymentState, string> = {
  idle: '',
  creating_booking: 'Reserving your slot…',
  creating_order: 'Setting up payment…',
  awaiting_payment: 'Complete payment in the Razorpay window…',
  verifying: 'Verifying payment…',
  paid: '',
  failed: '',
}

interface Props {
  item: MatchResultItem
  onClose: () => void
}

const RISK_COLORS: Record<string, string> = {
  low_risk:    'bg-green-100 text-green-700 border-green-200',
  medium_risk: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  high_risk:   'bg-red-100 text-red-700 border-red-200',
}
const RISK_LABELS: Record<string, string> = {
  low_risk:    'Low Dispute Risk',
  medium_risk: 'Medium Dispute Risk',
  high_risk:   'High Dispute Risk',
}
const RISK_ICONS: Record<string, typeof CheckCircle2> = {
  low_risk:    CheckCircle2,
  medium_risk: AlertTriangle,
  high_risk:   XCircle,
}

// Addendum 5: real, seeker-picked start/end date+time instead of a
// hardcoded "now to +7 days" window, formatted for a datetime-local input
// (local time, no timezone conversion — new Date(value).toISOString() at
// submit time handles that).
function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function defaultBookingWindow() {
  const starts = new Date(Date.now() + 24 * 60 * 60 * 1000)
  starts.setHours(10, 0, 0, 0)
  const ends = new Date(starts.getTime() + 24 * 60 * 60 * 1000)
  ends.setHours(18, 0, 0, 0)
  return { starts_at: toDatetimeLocalValue(starts), ends_at: toDatetimeLocalValue(ends) }
}

/** Signature animation (Addendum 7, Phase 52): the provider's ask and the
 * seeker's offer — real numbers from the form that was just submitted —
 * slide toward each other along a shared track until they meet exactly at
 * the real clearing price, then the price counts up. Plays once, only
 * because a real settled result just arrived. */
function AgreementConverge({
  providerAsk, providerMin, seekerOffer, seekerMax, clearingPrice,
}: { providerAsk: number; providerMin: number; seekerOffer: number; seekerMax: number; clearingPrice: number }) {
  const [priceRevealed, setPriceRevealed] = useState(false)
  const countedPrice = useCountUp(Math.round(clearingPrice), priceRevealed, 600)

  const domainMin = Math.min(providerMin, seekerOffer, clearingPrice) * 0.95
  const domainMax = Math.max(providerAsk, seekerMax, clearingPrice) * 1.05
  const pct = (v: number) => `${((v - domainMin) / (domainMax - domainMin)) * 100}%`

  return (
    <div>
      <div className="relative h-8 mb-3">
        <div className="absolute top-1/2 left-0 right-0 h-1 -translate-y-1/2 bg-gray-100 rounded-full" />
        {/* Provider's ask, starts at its real value, slides to the clearing price */}
        <motion.div
          initial={{ left: pct(providerAsk) }}
          animate={{ left: pct(clearingPrice) }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          onAnimationComplete={() => setPriceRevealed(true)}
          className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
        >
          <span className="text-[9px] text-wine font-medium mb-0.5">Provider</span>
          <div className="w-3 h-3 rounded-full bg-wine border-2 border-white shadow" />
        </motion.div>
        {/* Seeker's offer, same real convergence */}
        <motion.div
          initial={{ left: pct(seekerOffer) }}
          animate={{ left: pct(clearingPrice) }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          className="absolute bottom-0 -translate-x-1/2 flex flex-col items-center"
        >
          <div className="w-3 h-3 rounded-full bg-sage border-2 border-white shadow" />
          <span className="text-[9px] text-sage font-medium mt-0.5">Seeker</span>
        </motion.div>
      </div>
      <div className="text-4xl font-bold text-navy mt-1">
        ₹{countedPrice.toLocaleString('en-IN')}
        <span className="text-lg font-normal text-gray-400">/day</span>
      </div>
    </div>
  )
}

export default function NegotiatePage({ item, onClose }: Props) {
  const { asset } = item
  const [form, setForm] = useState({
    provider_ask: asset.price_per_day.toString(),
    provider_min: Math.round(asset.price_per_day * 0.75).toString(),
    seeker_offer: Math.round(asset.price_per_day * 0.7).toString(),
    seeker_max:   Math.round(asset.price_per_day * 0.9).toString(),
    extra_terms:  '',
    ...defaultBookingWindow(),
  })
  const [result, setResult]   = useState<NegotiateResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [multiRound, setMultiRound] = useState(false)
  const [smartSuggestion, setSmartSuggestion] = useState<SmartSuggestion | null>(null)

  // Phase 113: the real, per-listing negotiation floor — fetched from the
  // dedicated endpoint, never assumed from a 0.75-of-price guess. The
  // Provider Minimum field below is locked to this real value once known.
  const [realFloor, setRealFloor] = useState<number | null>(null)
  const [floorPopup, setFloorPopup] = useState('')
  useEffect(() => {
    negotiateAPI.getFloor(asset.id).then((res) => {
      setRealFloor(res.data.provider_min)
      setForm((p) => ({ ...p, provider_min: String(res.data.provider_min) }))
    }).catch(() => {})
  }, [asset.id])

  // Addendum 10, Phases 74 & 76: a real, honestly-new pricing-suggestion
  // feature with a real weather_multiplier, re-fetched whenever the
  // provider's ask, the chosen dates, or the global Simulation Mode
  // changes — so it (and the delivery-risk line below, Phase 76) update
  // together with the rest of the app when Simulation Mode is toggled.
  const [pricing, setPricing] = useState<PricingSuggestion | null>(null)
  const [simMode, setSimMode] = useState(simulationStore.getMode())
  useEffect(() => simulationStore.subscribe(() => setSimMode(simulationStore.getMode())), [])

  // Phase 38 (Addendum 4): real Razorpay payment — a booking is only ever
  // "Paid" after the backend's own server-side signature verification
  // succeeds, never from the client-side Checkout callback alone.
  const [paymentState, setPaymentState] = useState<PaymentState>('idle')
  const [paymentError, setPaymentError] = useState('')
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [paidAmount, setPaidAmount] = useState<number | null>(null)
  // Phase 87: provider contact, only fetched once this specific booking is
  // actually paid — the backend re-checks ownership + paid status itself,
  // this just avoids firing the call before it could possibly succeed.
  const [providerContact, setProviderContact] = useState<{ display_name: string; contact_phone: string } | null>(null)

  useEffect(() => {
    if (paymentState === 'paid' && bookingId) {
      bookingsAPI.getProviderContact(bookingId).then((res) => setProviderContact(res.data)).catch(() => {})
    }
  }, [paymentState, bookingId])

  useEffect(() => {
    negotiateAPI.smartSuggestion(asset.id).then((res) => setSmartSuggestion(res.data)).catch(() => {})
  }, [asset.id])

  // Addendum 10, Phase 74: debounced so it doesn't fire on every keystroke.
  useEffect(() => {
    const providerAsk = parseFloat(form.provider_ask)
    if (!providerAsk || !form.starts_at) { setPricing(null); return }
    const t = setTimeout(() => {
      negotiateAPI.pricingSuggestion(asset.id, providerAsk, new Date(form.starts_at).toISOString(), simMode)
        .then((res) => setPricing(res.data))
        .catch(() => setPricing(null))
    }, 500)
    return () => clearTimeout(t)
  }, [asset.id, form.provider_ask, form.starts_at, simMode])

  const update = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [f]: e.target.value }))

  const applySmartSuggestion = () => {
    if (smartSuggestion?.suggested_anchor) {
      setForm((p) => ({ ...p, provider_ask: String(Math.round(smartSuggestion.suggested_anchor!)) }))
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Phase 113: real client-side guard, before this ever reaches the
    // network — the backend enforces the exact same real floor
    // independently (Phase 114), this is just the fast, clear popup path.
    const offer = parseFloat(form.seeker_offer)
    if (realFloor != null && offer < realFloor) {
      setFloorPopup(`Your offer must be at least ₹${realFloor.toLocaleString('en-IN')} for this listing.`)
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await negotiateAPI.negotiate({
        asset_id:     asset.id,
        provider_ask: parseFloat(form.provider_ask),
        provider_min: parseFloat(form.provider_min),
        seeker_offer: parseFloat(form.seeker_offer),
        seeker_max:   parseFloat(form.seeker_max),
        extra_terms:  form.extra_terms || undefined,
        multi_round:  multiRound,
      })
      setResult(res.data)
    } catch (err: any) {
      // A direct/bypassed request still gets the real backend rejection
      // (Phase 114) — surfaced here as the same popup, not a generic banner.
      const detail = err?.response?.data?.detail
      if (err?.response?.status === 422 && typeof detail === 'string' && detail.includes('Your offer must be at least')) {
        setFloorPopup(detail)
      } else {
        setError(detail ?? 'Negotiation failed')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.92, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 20 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
      >
        <div className="bg-navy text-espresso px-6 py-4">
          <h2 className="font-bold text-lg">Negotiate — {asset.title}</h2>
          <p className="text-espresso/70 text-sm mt-0.5">ZOPA solver computes the clearing price from pure arithmetic</p>
        </div>

        <div className="p-6">
          {!result ? (
            <form onSubmit={submit} className="space-y-4">
              {smartSuggestion?.has_suggestion && (
                <div className="bg-lavender/10 border border-lavender/30 rounded-xl px-3 py-2.5 flex items-start gap-2">
                  <Sparkles size={14} className="text-navy mt-0.5 shrink-0" />
                  <div className="flex-1 text-xs text-gray-600">
                    <span className="font-medium text-navy">Smart mode</span> suggests an opening ask of{' '}
                    <span className="font-semibold">₹{smartSuggestion.suggested_anchor?.toLocaleString('en-IN')}</span>
                    <p className="text-gray-400 mt-0.5">{smartSuggestion.reason}</p>
                  </div>
                  <button type="button" onClick={applySmartSuggestion}
                    className="text-xs bg-navy text-espresso px-2.5 py-1 rounded-lg font-medium shrink-0 hover:bg-navy-light transition-colors">
                    Use this
                  </button>
                </div>
              )}
              {/* Addendum 10, Phase 74: a small, honestly-new pricing-
                  suggestion feature (no equivalent existed in this project
                  before this addendum) with a real weather_multiplier that
                  reuses Phase 69's demand_impact function exactly. */}
              {pricing && (
                <div className="bg-sage/10 border border-sage/30 rounded-xl px-3 py-2.5 flex items-start gap-2">
                  <TrendingUp size={14} className="text-sage mt-0.5 shrink-0" />
                  <div className="flex-1 text-xs text-gray-600">
                    <span className="font-medium text-sage">Suggested rate</span>{' '}
                    <span className="font-semibold">₹{pricing.suggested_rate.toLocaleString('en-IN')}/day</span>
                    <p className="text-gray-400 mt-0.5">{pricing.explanation}</p>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Provider Ask (₹/day)</label>
                  <input type="number" value={form.provider_ask} onChange={update('provider_ask')} required
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-navy" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Provider Minimum (₹/day)</label>
                  <input type="number" value={form.provider_min} readOnly required
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed" />
                  <p className="text-[11px] text-gray-400 mt-1">The real floor this provider set — fixed, not editable here.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Seeker Offer (₹/day)</label>
                  <input type="number" value={form.seeker_offer} onChange={update('seeker_offer')} required
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-navy" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Seeker Maximum (₹/day)</label>
                  <input type="number" value={form.seeker_max} onChange={update('seeker_max')} required
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-navy" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Extra Terms (optional)</label>
                <textarea value={form.extra_terms} onChange={update('extra_terms')} rows={2}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-navy resize-none"
                  placeholder="e.g. Security deposit ₹5000, no loud music after 10pm…" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Starts</label>
                  <input type="datetime-local" value={form.starts_at} onChange={update('starts_at')} required
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-navy" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Ends</label>
                  <input type="datetime-local" value={form.ends_at} onChange={update('ends_at')} required
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-navy" />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                <input type="checkbox" checked={multiRound} onChange={(e) => setMultiRound(e.target.checked)}
                  className="rounded border-gray-300 text-navy focus:ring-navy" />
                <Repeat size={12} /> Multi-round mode (both sides concede gradually over up to 3 rounds)
              </label>

              {error && <div className="text-red-600 text-sm bg-red-50 rounded-xl px-3 py-2">{error}</div>}

              <div className="flex gap-3">
                <button type="submit" disabled={loading}
                  className="flex-1 bg-navy text-espresso py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-navy-light transition-colors">
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  Compute Clearing Price
                </button>
                <button type="button" onClick={onClose}
                  className="px-5 py-2.5 text-gray-600 hover:bg-gray-100 rounded-xl text-sm transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div key="result" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                {result.status === 'settled' ? (
                  <>
                    {/* ── DETERMINISTIC SECTION ── */}
                    <div className="bg-navy/5 rounded-2xl p-5 mb-4 border border-navy/10">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle2 size={18} className="text-green-600" />
                        <span className="font-bold text-gray-900">Deal Settled</span>
                        <span className="ml-auto text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Deterministic ZOPA</span>
                      </div>

                      {/* Signature animation (Addendum 7, Phase 52): the
                          provider's and seeker's ranges slide toward each
                          other until they meet at the real clearing price,
                          then it counts up from 0 — triggered exactly once,
                          only because a real settled result just arrived. */}
                      <AgreementConverge
                        providerAsk={parseFloat(form.provider_ask)}
                        providerMin={parseFloat(form.provider_min)}
                        seekerOffer={parseFloat(form.seeker_offer)}
                        seekerMax={parseFloat(form.seeker_max)}
                        clearingPrice={result.clearing_price ?? 0}
                      />

                      <p className="text-xs text-gray-400 mt-2">
                        Computed as: (max(provider_min, seeker_offer) + min(provider_ask, seeker_max)) / 2
                      </p>
                      {result.rounds_log && result.rounds_log.length > 1 && (
                        <div className="mt-3 pt-3 border-t border-navy/10 text-xs text-gray-500 space-y-1">
                          <p className="font-medium text-gray-600 flex items-center gap-1"><Repeat size={11} /> Concession rounds:</p>
                          {result.rounds_log.map((r) => (
                            <div key={r.round} className="font-mono">
                              Round {r.round}: ask ₹{r.provider_ask.toLocaleString('en-IN')} · offer ₹{r.seeker_offer.toLocaleString('en-IN')}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* ── ADVISORY SECTION ── */}
                    <div className="space-y-3">
                      {result.dispute_risk_badge && (() => {
                        const RiskIcon = RISK_ICONS[result.dispute_risk_badge]
                        return (
                          <div className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-xl border ${RISK_COLORS[result.dispute_risk_badge]}`}>
                            <RiskIcon size={13} />
                            <span>{RISK_LABELS[result.dispute_risk_badge]}</span>
                            <span className="ml-auto opacity-60">Advisory · Laya</span>
                          </div>
                        )
                      })()}
                      {result.llm_phrasing && (
                        <div className="bg-lavender/10 border border-lavender/30 rounded-xl px-4 py-3 text-sm text-gray-700">
                          <div className="flex items-center gap-1.5 mb-1.5 text-xs text-gray-400 font-medium">
                            <Info size={12} /> AI Phrasing · Qwen2.5-0.5B
                          </div>
                          <p>{result.llm_phrasing}</p>
                        </div>
                      )}
                      {/* Addendum 9, Phase 62: Nugen domain-aligned negotiation
                          advisor — a secondary panel next to the real clearing
                          price, never the price itself. Absent (not shown) if
                          Nugen was unreachable — no fabricated insight. */}
                      {result.domain_insight && (
                        <div className="bg-sage/10 border border-sage/30 rounded-xl px-4 py-3 text-sm text-gray-700">
                          <div className="flex items-center gap-1.5 mb-1.5 text-xs text-gray-400 font-medium">
                            <Info size={12} /> Domain Insight
                          </div>
                          <p>{result.domain_insight}</p>
                          <NugenBadge
                            className="mt-2"
                            focus="Domain-aligned assessment of typical B2B hospitality rental pricing in India, by resource type and city tier."
                          />
                        </div>
                      )}
                      {result.extra_terms && (
                        <div className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2">
                          <span className="font-medium">Extra terms:</span> {result.extra_terms}
                        </div>
                      )}
                    </div>

                    {/* ── BOOKING + PAYMENT ACTION (Phase 38, Addendum 4) ── */}
                    {paymentState === 'paid' ? (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className="mt-4 bg-green-50 text-green-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2"
                      >
                        {/* Signature animation (Addendum 7, Phase 52): the
                            checkmark draws itself in the moment server-side
                            payment verification actually succeeds. */}
                        <svg width="20" height="20" viewBox="0 0 24 24" className="shrink-0">
                          <motion.circle
                            cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5"
                            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                            transition={{ duration: 0.35, ease: 'easeOut' }}
                          />
                          <motion.path
                            d="M7 12.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2"
                            strokeLinecap="round" strokeLinejoin="round"
                            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                            transition={{ duration: 0.3, delay: 0.3, ease: 'easeOut' }}
                          />
                        </svg>
                        Booking confirmed &amp; paid{paidAmount != null ? ` (₹${paidAmount.toLocaleString('en-IN')})` : ''} — verified by Razorpay. You can now run visual verification.
                      </motion.div>
                    ) : null}
                    {/* Phase 87: only ever shown on this specific paid
                        booking's own confirmation screen — never in search
                        results or listing details. */}
                    {paymentState === 'paid' && providerContact && (
                      <div className="mt-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
                        <div className="text-xs text-gray-400 font-medium mb-1.5">Provider Contact</div>
                        <p className="text-sm text-gray-800 font-medium">{providerContact.display_name}</p>
                        <p className="text-sm text-gray-600 flex items-center gap-1.5 mt-0.5">
                          <Phone size={13} /> {providerContact.contact_phone}
                        </p>
                      </div>
                    )}
                    {/* Addendum 10, Phase 76: a small, honestly-new
                        Confirm & Fulfill step for deliverable items — no
                        real courier/"Porter" integration exists in this
                        project (confirmed before building this), so this
                        is disclosed as this project's own delivery-risk
                        check, reusing the same real severity calculation
                        as the rest of the Weather Digital Twin. */}
                    {paymentState === 'paid' && DELIVERABLE_CATEGORIES.has(asset.category) && (
                      <div className="mt-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
                        <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium mb-1.5">
                          <Truck size={12} /> Confirm & Fulfill
                        </div>
                        {pricing?.weather_context && pricing.weather_context.severity >= 0.5 ? (
                          <p className="text-sm text-amber-700 flex items-center gap-1.5">
                            <AlertTriangle size={13} className="shrink-0" />
                            Elevated delivery delay risk due to current weather conditions.
                          </p>
                        ) : (
                          <p className="text-sm text-gray-500">No elevated delivery delay risk for this booking's date and location.</p>
                        )}
                      </div>
                    )}
                    {paymentState !== 'paid' && (
                      <button
                        onClick={async () => {
                          setPaymentError('')
                          try {
                            let bId = bookingId
                            if (!bId) {
                              setPaymentState('creating_booking')
                              const bookingRes = await bookingsAPI.create({
                                asset_id: asset.id,
                                negotiation_id: result.negotiation_id,
                                starts_at: new Date(form.starts_at).toISOString(),
                                ends_at: new Date(form.ends_at).toISOString(),
                              })
                              bId = bookingRes.data.id
                              setBookingId(bId)
                            }

                            setPaymentState('creating_order')
                            const orderRes = await bookingsAPI.createOrder(bId)

                            setPaymentState('awaiting_payment')
                            const user = authStore.getUser()
                            const paymentResponse = await openRazorpayCheckout({
                              keyId: orderRes.data.key_id,
                              amount: orderRes.data.amount,
                              currency: orderRes.data.currency,
                              orderId: orderRes.data.order_id,
                              name: 'AetherPact',
                              description: asset.title,
                              prefillName: user?.display_name,
                              prefillEmail: user?.email,
                            })

                            setPaymentState('verifying')
                            await bookingsAPI.verifyPayment(bId, paymentResponse)
                            setPaidAmount(orderRes.data.amount / 100)
                            setPaymentState('paid')
                          } catch (err: any) {
                            setPaymentState('failed')
                            setPaymentError(err?.response?.data?.detail ?? err?.message ?? 'Payment failed')
                          }
                        }}
                        disabled={paymentState !== 'idle' && paymentState !== 'failed'}
                        className="mt-4 w-full bg-green-600 text-white py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-green-700 transition-colors"
                      >
                        {paymentState !== 'idle' && paymentState !== 'failed' ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <CreditCard size={14} />
                        )}
                        {PAYMENT_STATE_LABEL[paymentState] || (paymentState === 'failed' ? 'Retry Payment' : 'Confirm & Pay (7 days)')}
                      </button>
                    )}
                    {paymentState === 'failed' && paymentError && (
                      <div className="mt-3 text-red-600 text-sm bg-red-50 rounded-xl px-3 py-2 flex items-center gap-2">
                        <XCircle size={14} className="shrink-0" /> {paymentError}
                      </div>
                    )}
                    {error && (
                      <div className="mt-3 text-red-600 text-sm bg-red-50 rounded-xl px-3 py-2">{error}</div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-4">
                    <XCircle size={40} className="text-red-400 mx-auto mb-3" />
                    <h3 className="font-bold text-gray-900 mb-2">No Deal</h3>
                    <p className="text-gray-500 text-sm">{result.llm_phrasing}</p>
                  </div>
                )}

                <button onClick={() => setResult(null)} className="mt-5 w-full text-sm text-navy font-medium hover:underline">
                  ← Try different numbers
                </button>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </motion.div>

      {/* Phase 113: the real, clear popup — the exact real provider_min
          number, never a generic placeholder message. */}
      <AnimatePresence>
        {floorPopup && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
            onClick={(e) => e.target === e.currentTarget && setFloorPopup('')}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm text-center"
            >
              <AlertTriangle size={28} className="text-amber-500 mx-auto mb-3" />
              <p className="font-semibold text-gray-900 mb-1">Offer too low</p>
              <p className="text-sm text-gray-600 mb-5">{floorPopup}</p>
              <button onClick={() => setFloorPopup('')}
                className="w-full bg-navy text-espresso py-2 rounded-xl font-semibold text-sm hover:bg-navy-light transition-colors">
                OK
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
