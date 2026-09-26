/**
 * AetherPact — Negotiate & Settle view.
 * Shows real clearing_price prominently, LLM phrasing, and Laya dispute-risk badge.
 * Visually separated so it's clear which parts are deterministic and which advisory.
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react'
import { negotiateAPI, bookingsAPI } from '../api/client'
import type { MatchResultItem, NegotiateResponse } from '../api/client'

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
  low_risk:    '✅ Low Dispute Risk',
  medium_risk: '⚠️ Medium Dispute Risk',
  high_risk:   '🔴 High Dispute Risk',
}

export default function NegotiatePage({ item, onClose }: Props) {
  const { asset } = item
  const [form, setForm] = useState({
    provider_ask: asset.price_per_day.toString(),
    provider_min: Math.round(asset.price_per_day * 0.75).toString(),
    seeker_offer: Math.round(asset.price_per_day * 0.7).toString(),
    seeker_max:   Math.round(asset.price_per_day * 0.9).toString(),
    extra_terms:  '',
  })
  const [result, setResult]   = useState<NegotiateResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [booking, setBooking] = useState(false)
  const [booked, setBooked]   = useState(false)

  const update = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [f]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
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
      })
      setResult(res.data)
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Negotiation failed')
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
        <div className="bg-navy text-white px-6 py-4">
          <h2 className="font-bold text-lg">Negotiate — {asset.title}</h2>
          <p className="text-white/70 text-sm mt-0.5">ZOPA solver computes the clearing price from pure arithmetic</p>
        </div>

        <div className="p-6">
          {!result ? (
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Provider Ask (₹/day)</label>
                  <input type="number" value={form.provider_ask} onChange={update('provider_ask')} required
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-navy" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Provider Minimum (₹/day)</label>
                  <input type="number" value={form.provider_min} onChange={update('provider_min')} required
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-navy" />
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

              {error && <div className="text-red-600 text-sm bg-red-50 rounded-xl px-3 py-2">{error}</div>}

              <div className="flex gap-3">
                <button type="submit" disabled={loading}
                  className="flex-1 bg-navy text-white py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-navy-light transition-colors">
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
                      <div className="text-4xl font-bold text-navy mt-3">
                        ₹{result.clearing_price?.toLocaleString('en-IN')}
                        <span className="text-lg font-normal text-gray-400">/day</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-2">
                        Computed as: (max(provider_min, seeker_offer) + min(provider_ask, seeker_max)) / 2
                      </p>
                    </div>

                    {/* ── ADVISORY SECTION ── */}
                    <div className="space-y-3">
                      {result.dispute_risk_badge && (
                        <div className={`flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-xl border ${RISK_COLORS[result.dispute_risk_badge]}`}>
                          <AlertTriangle size={13} />
                          <span>{RISK_LABELS[result.dispute_risk_badge]}</span>
                          <span className="ml-auto opacity-60">Advisory · Laya</span>
                        </div>
                      )}
                      {result.llm_phrasing && (
                        <div className="bg-lavender/10 border border-lavender/30 rounded-xl px-4 py-3 text-sm text-gray-700">
                          <div className="flex items-center gap-1.5 mb-1.5 text-xs text-gray-400 font-medium">
                            <Info size={12} /> AI Phrasing · Qwen2.5-0.5B
                          </div>
                          <p>{result.llm_phrasing}</p>
                        </div>
                      )}
                      {result.extra_terms && (
                        <div className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2">
                          <span className="font-medium">Extra terms:</span> {result.extra_terms}
                        </div>
                      )}
                    </div>

                    {/* ── BOOKING ACTION ── */}
                    {!booked ? (
                      <button
                        onClick={async () => {
                          setBooking(true)
                          try {
                            const now = new Date()
                            const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
                            await bookingsAPI.create({
                              asset_id: asset.id,
                              negotiation_id: result.negotiation_id,
                              starts_at: now.toISOString(),
                              ends_at: end.toISOString(),
                            })
                            setBooked(true)
                          } catch (err: any) {
                            setError(err?.response?.data?.detail ?? 'Booking failed — you may need to sign in first.')
                          } finally {
                            setBooking(false)
                          }
                        }}
                        disabled={booking}
                        className="mt-4 w-full bg-green-600 text-white py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-green-700 transition-colors"
                      >
                        {booking && <Loader2 size={14} className="animate-spin" />}
                        Confirm & Book (7 days)
                      </button>
                    ) : (
                      <div className="mt-4 bg-green-50 text-green-700 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
                        <CheckCircle2 size={16} /> Booking confirmed! You can now run visual verification.
                      </div>
                    )}
                    {error && !booked && (
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
    </motion.div>
  )
}
