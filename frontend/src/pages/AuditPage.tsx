/**
 * AetherPact — Visual Verification (Audit) Page.
 * Upload check-in and check-out photos for a booking.
 * OpenCV-based visual change detection — NOT damage classification.
 */

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, Upload, CheckCircle, AlertTriangle, Loader2, Eye, ArrowLeft } from 'lucide-react'
import { bookingsAPI, auditAPI } from '../api/client'
import type { BookingItem, AuditSummary } from '../api/client'
import { authStore } from '../store/auth'

interface ChangeBox {
  x: number
  y: number
  w: number
  h: number
}

export default function AuditPage() {
  const nav = useNavigate()
  const user = authStore.getUser()

  const [bookings, setBookings] = useState<BookingItem[]>([])
  const [loadingBookings, setLoadingBookings] = useState(true)
  const [selected, setSelected] = useState<BookingItem | null>(null)
  const [checkinFile, setCheckinFile] = useState<File | null>(null)
  const [checkoutFile, setCheckoutFile] = useState<File | null>(null)
  const [checkinDone, setCheckinDone] = useState(false)
  const [auditResult, setAuditResult] = useState<AuditSummary | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const checkinRef = useRef<HTMLInputElement>(null)
  const checkoutRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!authStore.getToken()) { nav('/login'); return }
    bookingsAPI.list()
      .then((res) => setBookings(res.data))
      .catch(() => setError('Could not load bookings'))
      .finally(() => setLoadingBookings(false))
  }, [])

  const handleCheckin = async () => {
    if (!selected || !checkinFile) return
    setUploading(true)
    setError('')
    try {
      await auditAPI.checkin(selected.id, checkinFile)
      setCheckinDone(true)
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Check-in upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleCheckout = async () => {
    if (!selected || !checkoutFile) return
    setUploading(true)
    setError('')
    try {
      const res = await auditAPI.checkout(selected.id, checkoutFile)
      setAuditResult(res.data)
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Check-out upload failed')
    } finally {
      setUploading(false)
    }
  }

  const changeBoxes: ChangeBox[] = auditResult?.change_regions
    ? JSON.parse(auditResult.change_regions)
    : []

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-lavender/10">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 max-w-6xl mx-auto border-b border-lavender/20 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => nav('/')}>
          <div className="w-8 h-8 rounded-lg bg-navy flex items-center justify-center">
            <span className="text-white text-sm font-bold">Æ</span>
          </div>
          <span className="font-bold text-navy text-xl">Visual Verification</span>
        </div>
        <div className="flex gap-4 items-center">
          <button onClick={() => nav('/seeker')} className="text-sm text-navy font-medium hover:underline">Find Resources</button>
          <button onClick={() => nav('/provider')} className="text-sm text-navy font-medium hover:underline">Provider Portal</button>
          <span className="text-gray-300">|</span>
          <span className="text-sm text-gray-500">{user?.display_name ?? 'Guest'}</span>
          {user ? (
            <button onClick={() => { authStore.logout(); nav('/') }} className="text-sm text-navy hover:underline">Sign out</button>
          ) : (
            <button onClick={() => nav('/login')} className="text-sm bg-navy text-white px-4 py-2 rounded-full font-medium hover:bg-navy-light transition-colors">Sign In</button>
          )}
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-8 py-10">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Visual Change Detection</h1>
          <p className="text-gray-500 mb-8">
            OpenCV-based structural change detection between check-in and check-out photos.
            <span className="block text-xs text-gray-400 mt-1">
              This is NOT damage classification — it detects visual structural differences only.
            </span>
          </p>
        </motion.div>

        {error && (
          <div className="text-red-600 bg-red-50 rounded-xl px-4 py-3 text-sm mb-6">{error}</div>
        )}

        {/* Step 1: Select booking */}
        {!selected ? (
          <div>
            <h2 className="font-semibold text-gray-900 mb-4">Select a Booking</h2>
            {loadingBookings ? (
              <div className="space-y-3">
                {[1, 2].map(i => (
                  <div key={i} className="h-16 bg-white rounded-2xl border border-gray-100 animate-pulse" />
                ))}
              </div>
            ) : bookings.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Camera size={40} className="mx-auto mb-3 opacity-40" />
                <p>No bookings found. Complete a negotiation and book a resource first.</p>
                <button onClick={() => nav('/seeker')}
                  className="mt-4 text-sm text-navy font-medium hover:underline">
                  Go to Seeker Portal
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {bookings.map((b, i) => (
                  <motion.button
                    key={b.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => setSelected(b)}
                    className="w-full bg-white rounded-2xl border border-lavender/20 shadow-sm p-5 flex items-center justify-between gap-4 text-left hover:shadow-md transition-shadow"
                  >
                    <div>
                      <h3 className="font-semibold text-gray-900">{b.asset_title ?? 'Booking'}</h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(b.starts_at).toLocaleDateString()} → {new Date(b.ends_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                      {b.status}
                    </span>
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            <button onClick={() => { setSelected(null); setCheckinDone(false); setCheckinFile(null); setCheckoutFile(null); setAuditResult(null) }}
              className="flex items-center gap-1 text-sm text-navy font-medium hover:underline mb-6">
              <ArrowLeft size={14} /> Back to bookings
            </button>

            <div className="bg-white rounded-2xl border border-lavender/20 shadow-sm p-5 mb-6">
              <h3 className="font-semibold text-gray-900">{selected.asset_title ?? 'Booking'}</h3>
              <p className="text-xs text-gray-400">
                {new Date(selected.starts_at).toLocaleDateString()} → {new Date(selected.ends_at).toLocaleDateString()}
                {' · '}{selected.id.slice(0, 8)}…
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Check-in */}
              <div className="bg-white rounded-2xl border border-lavender/20 shadow-sm p-5">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Camera size={16} className="text-navy" /> Check-in Photo
                </h3>
                <input ref={checkinRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => setCheckinFile(e.target.files?.[0] ?? null)} />
                {checkinFile ? (
                  <div className="space-y-3">
                    <img src={URL.createObjectURL(checkinFile)} alt="Check-in"
                      className="w-full h-48 object-cover rounded-xl" />
                    <p className="text-xs text-gray-500 truncate">{checkinFile.name}</p>
                  </div>
                ) : (
                  <button onClick={() => checkinRef.current?.click()}
                    className="w-full h-48 border-2 border-dashed border-lavender rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-navy hover:text-navy transition-colors">
                    <Upload size={24} />
                    <span className="text-sm">Upload check-in photo</span>
                  </button>
                )}
                {checkinFile && !checkinDone && (
                  <button onClick={handleCheckin} disabled={uploading}
                    className="mt-3 w-full bg-navy text-white py-2 rounded-xl font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-navy-light transition-colors">
                    {uploading && <Loader2 size={14} className="animate-spin" />}
                    Submit Check-in
                  </button>
                )}
                {checkinDone && (
                  <div className="mt-3 flex items-center gap-2 text-green-600 text-sm">
                    <CheckCircle size={16} /> Check-in uploaded
                  </div>
                )}
              </div>

              {/* Check-out */}
              <div className="bg-white rounded-2xl border border-lavender/20 shadow-sm p-5">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Eye size={16} className="text-navy" /> Check-out Photo
                </h3>
                <input ref={checkoutRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => setCheckoutFile(e.target.files?.[0] ?? null)} />
                {!checkinDone ? (
                  <div className="w-full h-48 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center text-gray-300 text-sm">
                    Upload check-in photo first
                  </div>
                ) : checkoutFile ? (
                  <div className="space-y-3">
                    <img src={URL.createObjectURL(checkoutFile)} alt="Check-out"
                      className="w-full h-48 object-cover rounded-xl" />
                    <p className="text-xs text-gray-500 truncate">{checkoutFile.name}</p>
                  </div>
                ) : (
                  <button onClick={() => checkoutRef.current?.click()}
                    className="w-full h-48 border-2 border-dashed border-lavender rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-navy hover:text-navy transition-colors">
                    <Upload size={24} />
                    <span className="text-sm">Upload check-out photo</span>
                  </button>
                )}
                {checkoutFile && !auditResult && checkinDone && (
                  <button onClick={handleCheckout} disabled={uploading}
                    className="mt-3 w-full bg-navy text-white py-2 rounded-xl font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-navy-light transition-colors">
                    {uploading && <Loader2 size={14} className="animate-spin" />}
                    Run Visual Comparison
                  </button>
                )}
              </div>
            </div>

            {/* Results */}
            <AnimatePresence>
              {auditResult && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  className="mt-8 bg-white rounded-2xl border border-lavender/20 shadow-sm p-6">
                  <h3 className="font-bold text-gray-900 text-lg mb-4">Detection Result</h3>

                  {auditResult.change_detected ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 mb-4 flex items-start gap-2">
                      <AlertTriangle size={16} className="text-yellow-600 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-semibold text-yellow-800">Visual changes detected</span>
                        <p className="text-xs text-yellow-700 mt-0.5">
                          {changeBoxes.length} region{changeBoxes.length !== 1 ? 's' : ''} flagged.
                          This is visual change detection only — not damage classification.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-2">
                      <CheckCircle size={16} className="text-green-600" />
                      <span className="text-green-800 font-medium text-sm">No significant visual changes detected</span>
                    </div>
                  )}

                  {changeBoxes.length > 0 && (
                    <div className="text-xs text-gray-500 space-y-1">
                      <p className="font-medium text-gray-700">Change regions (bounding boxes):</p>
                      {changeBoxes.map((box, i) => (
                        <div key={i} className="bg-gray-50 rounded px-2 py-1 font-mono">
                          Region {i + 1}: x={box.x}, y={box.y}, {box.w}×{box.h}px
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  )
}
