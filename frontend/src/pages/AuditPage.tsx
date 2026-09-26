/**
 * AetherPact — Visual Verification (Audit) Page.
 * Upload check-in and check-out photos for a booking.
 * OpenCV-based visual change detection — NOT damage classification.
 */

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, Upload, CheckCircle, AlertTriangle, Loader2, Eye, ArrowLeft, Video, X, ThumbsDown, ThumbsUp, Star } from 'lucide-react'
import { bookingsAPI, auditAPI, reviewsAPI } from '../api/client'
import type { BookingItem, AuditSummary, TriageLabel } from '../api/client'
import { authStore } from '../store/auth'

interface ChangeBox {
  x: number
  y: number
  w: number
  h: number
}

/** Closes the LIST -> ... -> VERIFY -> REVIEW loop with a real POST /reviews
 * call — no fabricated "thanks for your review" without it actually saving. */
function ReviewForm({ bookingId }: { bookingId: string }) {
  const [score, setScore] = useState(0)
  const [hoverScore, setHoverScore] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (score < 1) return
    setSubmitting(true)
    setError('')
    try {
      await reviewsAPI.create(bookingId, score, comment || undefined)
      setSubmitted(true)
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Could not submit review')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="mt-4 bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-green-700">
        <CheckCircle size={16} /> Thanks — your review was saved.
      </div>
    )
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <p className="text-sm font-medium text-gray-700 mb-2">Rate this booking</p>
      <div className="flex gap-1 mb-3">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button"
            onMouseEnter={() => setHoverScore(n)} onMouseLeave={() => setHoverScore(0)}
            onClick={() => setScore(n)}
            className="p-0.5">
            <Star size={22} className={(hoverScore || score) >= n ? 'fill-amber-400 text-amber-400' : 'text-gray-300'} />
          </button>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
        placeholder="Optional comment…"
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-navy resize-none mb-2" />
      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
      <button onClick={submit} disabled={score < 1 || submitting}
        className="bg-navy text-espresso px-4 py-2 rounded-xl font-semibold text-sm disabled:opacity-40 flex items-center gap-2 hover:bg-navy-light transition-colors">
        {submitting && <Loader2 size={14} className="animate-spin" />} Submit Review
      </button>
    </div>
  )
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
  // Phase 14 (Addendum 2): active-learning triage — {region_index: label}
  const [triageDone, setTriageDone] = useState<Record<number, TriageLabel>>({})
  const [triagingRegion, setTriagingRegion] = useState<number | null>(null)

  const checkinRef = useRef<HTMLInputElement>(null)
  const checkoutRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Phase 11 (Addendum 2): onion-skin camera guidance for check-out capture.
  // Pure UI aid — overlays the check-in photo at low opacity on the live
  // preview so the operator can match framing; does not touch what gets
  // uploaded or how the backend processes it.
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState('')

  useEffect(() => {
    // Phase 37 (Addendum 4): wait for Firebase to report the session at
    // least once before deciding to redirect — otherwise a real session
    // briefly looks logged-out during the async restore.
    const check = () => {
      if (!authStore.isReady()) return
      if (!authStore.isAuthenticated()) { nav('/login'); return }
      bookingsAPI.list()
        .then((res) => setBookings(res.data))
        .catch(() => setError('Could not load bookings'))
        .finally(() => setLoadingBookings(false))
    }
    check()
    return authStore.subscribe(check)
  }, [])

  useEffect(() => {
    // Stop the camera stream on unmount / booking change to release the device.
    return () => stopCamera()
  }, [])

  const startCamera = async () => {
    setCameraError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      setCameraActive(true)
      if (videoRef.current) videoRef.current.srcObject = stream
    } catch (err: any) {
      setCameraError(err?.message ?? 'Could not access camera')
    }
  }

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraActive(false)
  }

  const capturePhoto = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (!blob) return
      setCheckoutFile(new File([blob], `checkout_camera_${Date.now()}.jpg`, { type: 'image/jpeg' }))
      stopCamera()
    }, 'image/jpeg', 0.92)
  }

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

  const handleTriage = async (regionIndex: number, label: TriageLabel) => {
    if (!auditResult?.checkout) return
    setTriagingRegion(regionIndex)
    try {
      await auditAPI.triage(auditResult.checkout.id, regionIndex, label)
      setTriageDone((p) => ({ ...p, [regionIndex]: label }))
    } catch {
      setError('Could not save that review label')
    } finally {
      setTriagingRegion(null)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-lavender/10">
      {/* Nav */}
      <nav className="flex items-center justify-between px-4 py-4 max-w-6xl mx-auto border-b border-lavender/20 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => nav('/')}>
          <div className="w-8 h-8 rounded-lg bg-navy flex items-center justify-center">
            <span className="text-espresso text-sm font-bold">Æ</span>
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
            <button onClick={() => nav('/login')} className="text-sm bg-navy text-espresso px-4 py-2 rounded-full font-medium hover:bg-navy-light transition-colors">Sign In</button>
          )}
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-8">
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
            <button onClick={() => { setSelected(null); setCheckinDone(false); setCheckinFile(null); setCheckoutFile(null); setAuditResult(null); setTriageDone({}) }}
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
                    className="mt-3 w-full bg-navy text-espresso py-2 rounded-xl font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-navy-light transition-colors">
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
                <canvas ref={canvasRef} className="hidden" />
                {!checkinDone ? (
                  <div className="w-full h-48 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center text-gray-300 text-sm">
                    Upload check-in photo first
                  </div>
                ) : cameraActive ? (
                  <div className="space-y-2">
                    <div className="relative w-full h-48 rounded-xl overflow-hidden bg-black">
                      <video ref={videoRef} autoPlay playsInline muted
                        className="w-full h-full object-cover" />
                      {checkinFile && (
                        <img src={URL.createObjectURL(checkinFile)} alt="Check-in guide overlay"
                          className="absolute inset-0 w-full h-full object-cover opacity-[0.375] pointer-events-none"
                        />
                      )}
                      <p className="absolute bottom-1.5 left-1.5 text-[10px] bg-black/50 text-white px-2 py-0.5 rounded-full">
                        Line up the faded check-in photo, then capture
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={capturePhoto}
                        className="flex-1 bg-navy text-espresso py-2 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-navy-light transition-colors">
                        <Camera size={14} /> Capture
                      </button>
                      <button onClick={stopCamera}
                        className="px-3 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition-colors flex items-center gap-1">
                        <X size={14} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : checkoutFile ? (
                  <div className="space-y-3">
                    <img src={URL.createObjectURL(checkoutFile)} alt="Check-out"
                      className="w-full h-48 object-cover rounded-xl" />
                    <p className="text-xs text-gray-500 truncate">{checkoutFile.name}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button onClick={() => checkoutRef.current?.click()}
                      className="w-full h-48 border-2 border-dashed border-lavender rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-navy hover:text-navy transition-colors">
                      <Upload size={24} />
                      <span className="text-sm">Upload check-out photo</span>
                    </button>
                    <button onClick={startCamera}
                      className="w-full flex items-center justify-center gap-1.5 text-xs text-navy font-medium hover:underline">
                      <Video size={13} /> Or use camera with check-in overlay guide
                    </button>
                    {cameraError && <p className="text-xs text-red-500">{cameraError}</p>}
                  </div>
                )}
                {checkoutFile && !auditResult && checkinDone && (
                  <button onClick={handleCheckout} disabled={uploading}
                    className="mt-3 w-full bg-navy text-espresso py-2 rounded-xl font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-navy-light transition-colors">
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
                    <div className="text-xs text-gray-500 space-y-2">
                      <p className="font-medium text-gray-700">Change regions (bounding boxes):</p>
                      {changeBoxes.map((box, i) => (
                        <div key={i} className="bg-gray-50 rounded-lg px-2.5 py-2 flex items-center justify-between gap-2">
                          <span className="font-mono">
                            Region {i + 1}: x={box.x}, y={box.y}, {box.w}×{box.h}px
                          </span>
                          {triageDone[i] ? (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
                              triageDone[i] === 'dispute_accepted' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                            }`}>
                              {triageDone[i] === 'dispute_accepted' ? 'Marked: confirmed change' : 'Marked: false alarm'}
                            </span>
                          ) : (
                            <div className="flex gap-1.5 shrink-0">
                              <button onClick={() => handleTriage(i, 'false_alarm')} disabled={triagingRegion === i}
                                className="flex items-center gap-1 text-xs bg-white border border-gray-200 px-2 py-1 rounded-lg hover:border-green-300 hover:text-green-700 transition-colors disabled:opacity-50">
                                {triagingRegion === i ? <Loader2 size={11} className="animate-spin" /> : <ThumbsDown size={11} />} False alarm
                              </button>
                              <button onClick={() => handleTriage(i, 'dispute_accepted')} disabled={triagingRegion === i}
                                className="flex items-center gap-1 text-xs bg-white border border-gray-200 px-2 py-1 rounded-lg hover:border-red-300 hover:text-red-700 transition-colors disabled:opacity-50">
                                {triagingRegion === i ? <Loader2 size={11} className="animate-spin" /> : <ThumbsUp size={11} />} Confirm change
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                      <p className="text-[11px] text-gray-400 pt-1">
                        Your review here only saves labeled examples for a future vision-classifier
                        training pass — it doesn't retrain anything now, and this result was already
                        decided by the OpenCV pipeline above.
                      </p>
                    </div>
                  )}

                  {auditResult.alignment_unavailable && (
                    <div className="mt-3 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 text-xs text-orange-700 flex items-start gap-2">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      <span>
                        Too few matching features found between the two photos to align them
                        before comparing — the result above may be affected by camera angle,
                        not just genuine changes. Retake with closer framing for a more reliable result.
                      </span>
                    </div>
                  )}

                  {selected && <ReviewForm bookingId={selected.id} />}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  )
}
