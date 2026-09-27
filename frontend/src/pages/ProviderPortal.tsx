/**
 * AetherPact — Provider Portal.
 * Listing form (with Laya safety advisory), list of own listings, revenue summary.
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Loader2, AlertTriangle, CheckCircle, TrendingUp, Repeat, ChevronDown, Star, CalendarCheck, Gift, Copy, LocateFixed, Image as ImageIcon, CalendarRange, User as UserIcon } from 'lucide-react'
import { listingsAPI, analyticsAPI, authAPI, bookingsAPI, listingImageUrl } from '../api/client'
import type { Listing, RecurringAvailabilityRule, AvailabilityWindow, ProviderAnalytics, ReferralStatus, ProviderBookingItem } from '../api/client'
import { authStore } from '../store/auth'
import { useNavigate } from 'react-router-dom'
import { useCountUp } from '../hooks/useCountUp'
import NugenBadge from '../components/NugenBadge'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** Addendum 7, Phase 53: a dashboard number counts up once the real value
 * from the backend arrives — never on a fixed timer, and re-triggers
 * cleanly whenever the real value itself changes. */
function AnimatedStatNumber({ value }: { value: number }) {
  const counted = useCountUp(value, true, 600)
  return <>{counted}</>
}

/** Phase 12 (Addendum 2): provider-facing control for a standing weekly
 * block, e.g. "every Tuesday, 14:00 to 18:00", instead of manually entering
 * every future date a resource is unavailable. */
function RecurringAvailabilityControl({ assetId }: { assetId: string }) {
  const [open, setOpen] = useState(false)
  const [rules, setRules] = useState<RecurringAvailabilityRule[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ day_of_week: 1, start_time: '14:00', end_time: '18:00' })

  const loadRules = () => {
    setLoading(true)
    listingsAPI.listRecurringAvailability(assetId)
      .then((res) => setRules(res.data))
      .catch(() => setError('Could not load recurring blocks'))
      .finally(() => setLoading(false))
  }

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && rules.length === 0) loadRules()
  }

  const addRule = async () => {
    setSaving(true)
    setError('')
    try {
      await listingsAPI.createRecurringAvailability(assetId, form)
      loadRules()
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Failed to add recurring block')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <button onClick={toggle} className="flex items-center gap-1.5 text-xs text-navy font-medium hover:underline">
        <Repeat size={12} /> Recurring availability
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={12} />
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 space-y-2">
              {loading ? (
                <p className="text-xs text-gray-400">Loading…</p>
              ) : rules.length === 0 ? (
                <p className="text-xs text-gray-400">No standing blocks yet.</p>
              ) : (
                rules.map((r) => (
                  <div key={r.id} className="text-xs bg-gray-50 rounded-lg px-2.5 py-1.5">
                    Every {WEEKDAYS[r.day_of_week]}, {r.start_time}–{r.end_time}
                  </div>
                ))
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <select value={form.day_of_week}
                  onChange={(e) => setForm((p) => ({ ...p, day_of_week: parseInt(e.target.value) }))}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white">
                  {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
                <input type="time" value={form.start_time}
                  onChange={(e) => setForm((p) => ({ ...p, start_time: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs" />
                <span className="text-xs text-gray-400">to</span>
                <input type="time" value={form.end_time}
                  onChange={(e) => setForm((p) => ({ ...p, end_time: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs" />
                <button onClick={addRule} disabled={saving}
                  className="text-xs bg-navy text-espresso px-3 py-1 rounded-lg font-medium disabled:opacity-50 flex items-center gap-1">
                  {saving && <Loader2 size={10} className="animate-spin" />} Add block
                </button>
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Addendum 5: provider-facing control for a one-off "available from X to Y"
 * window — purely informational (booking conflicts are still decided by
 * real overlapping bookings/recurring blocks), but a real, persisted way
 * for a provider to communicate an available date/time range. */
function AvailabilityWindowControl({ assetId }: { assetId: string }) {
  const [open, setOpen] = useState(false)
  const [windows, setWindows] = useState<AvailabilityWindow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const defaultWindow = defaultAvailabilityWindow()
  const [form, setForm] = useState(defaultWindow)

  const loadWindows = () => {
    setLoading(true)
    listingsAPI.listAvailabilityWindows(assetId)
      .then((res) => setWindows(res.data))
      .catch(() => setError('Could not load availability windows'))
      .finally(() => setLoading(false))
  }

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && windows.length === 0) loadWindows()
  }

  const addWindow = async () => {
    setSaving(true)
    setError('')
    try {
      await listingsAPI.createAvailabilityWindow(assetId, {
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: new Date(form.ends_at).toISOString(),
      })
      loadWindows()
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? 'Failed to add availability window')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <button onClick={toggle} className="flex items-center gap-1.5 text-xs text-navy font-medium hover:underline">
        <CalendarRange size={12} /> Available date/time range
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={12} />
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 space-y-2">
              {loading ? (
                <p className="text-xs text-gray-400">Loading…</p>
              ) : windows.length === 0 ? (
                <p className="text-xs text-gray-400">No available windows declared yet.</p>
              ) : (
                windows.map((w) => (
                  <div key={w.id} className="text-xs bg-gray-50 rounded-lg px-2.5 py-1.5">
                    {new Date(w.starts_at).toLocaleString('en-IN')} → {new Date(w.ends_at).toLocaleString('en-IN')}
                  </div>
                ))
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input type="datetime-local" value={form.starts_at}
                  onChange={(e) => setForm((p) => ({ ...p, starts_at: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs" />
                <span className="text-xs text-gray-400">to</span>
                <input type="datetime-local" value={form.ends_at}
                  onChange={(e) => setForm((p) => ({ ...p, ends_at: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs" />
                <button onClick={addWindow} disabled={saving}
                  className="text-xs bg-navy text-espresso px-3 py-1 rounded-lg font-medium disabled:opacity-50 flex items-center gap-1">
                  {saving && <Loader2 size={10} className="animate-spin" />} Add window
                </button>
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function defaultAvailabilityWindow() {
  const pad = (n: number) => String(n).padStart(2, '0')
  const toLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  const starts = new Date(Date.now() + 24 * 60 * 60 * 1000)
  starts.setHours(9, 0, 0, 0)
  const ends = new Date(starts.getTime() + 7 * 24 * 60 * 60 * 1000)
  ends.setHours(21, 0, 0, 0)
  return { starts_at: toLocal(starts), ends_at: toLocal(ends) }
}

const CATEGORIES = [
  { value: 'banquet_hall',      label: 'Banquet Hall' },
  { value: 'commercial_kitchen', label: 'Commercial Kitchen' },
  { value: 'av_equipment',      label: 'AV & Event Equipment' },
  { value: 'transportation',    label: 'Transportation / Fleet' },
  { value: 'event_space',       label: 'Rooftop / Event Space' },
  { value: 'other',             label: 'Other' },
]

interface SafetyNote {
  flagged: boolean
  advisory_note: string | null
  confidence: number
  domain_review: string | null // Nugen domain-aligned compliance reviewer (Addendum 9, Phase 63)
}

export default function ProviderPortal() {
  const nav  = useNavigate()
  const [user, setUser] = useState(authStore.getUser())

  useEffect(() => {
    // Re-sync immediately — the store can change in the gap between this
    // component's initial render and this effect subscribing (e.g. a
    // just-completed sign-in), which subscribe() alone would miss forever.
    setUser(authStore.getUser())
    return authStore.subscribe(() => setUser(authStore.getUser()))
  }, [])

  useEffect(() => {
    // Phase 37 (Addendum 4): must wait for Firebase to report the session at
    // least once — otherwise a real session briefly looks logged-out during
    // the async restore and this redirects a valid user to /login.
    // Phase 83: a seeker-only account has no provider portal to see — send
    // them to their own portal instead of leaving the provider dashboard
    // reachable by direct URL. 'both' and 'provider' roles are unaffected.
    const check = () => {
      if (!authStore.isReady()) return
      if (!authStore.isAuthenticated()) { nav('/login'); return }
      if (authStore.getUser()?.role === 'seeker') nav('/explore')
    }
    check()
    return authStore.subscribe(check)
  }, [])

  const [listings, setListings]         = useState<Listing[]>([])
  const [loadingList, setLoadingList]   = useState(true)
  const [analytics, setAnalytics]       = useState<ProviderAnalytics | null>(null)
  const [referral, setReferral]         = useState<ReferralStatus | null>(null)
  const [copied, setCopied]             = useState(false)
  const [showForm, setShowForm]         = useState(false)
  const [safetyNote, setSafetyNote]     = useState<SafetyNote | null>(null)
  const [submitting, setSubmitting]     = useState(false)
  const [checkingDesc, setCheckingDesc] = useState(false)
  const [success, setSuccess]           = useState(false)
  const [providerBookings, setProviderBookings] = useState<ProviderBookingItem[]>([])
  const [loadingBookings, setLoadingBookings]   = useState(true)

  const [form, setForm] = useState({
    title: '', description: '', category: 'banquet_hall',
    price_per_day: '', provider_min: '', address: '', capacity: '', maps_link: '', owner_display_name: '',
    listing_contact_phone: '',
  })
  // Phase 102: prefill from the account-level number the moment it's known
  // (auth restores asynchronously), without ever overwriting an in-progress edit.
  useEffect(() => {
    if (user?.contact_phone) {
      setForm((prev) => prev.listing_contact_phone ? prev : { ...prev, listing_contact_phone: user.contact_phone! })
    }
  }, [user?.contact_phone])
  // Addendum 5: a real photo is required for every new listing.
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoError, setPhotoError] = useState('')
  const [priceError, setPriceError] = useState('')
  // Phase 36 (Addendum 4): coordinates are never raw-typed — only captured
  // via the browser's own geolocation, kept out of the visible form entirely.
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lon: number } | null>(null)
  const [geoStatus, setGeoStatus] = useState<'idle' | 'locating' | 'success' | 'error'>('idle')

  const useMyLocation = () => {
    if (!navigator.geolocation) { setGeoStatus('error'); return }
    setGeoStatus('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude })
        setGeoStatus('success')
      },
      () => setGeoStatus('error'),
      { timeout: 10000 },
    )
  }

  const update = (field: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }))

  // Load own listings. Depends on user?.id too: the auth session restores
  // asynchronously, so `user` is still null on first mount — without this
  // dependency, the filter below would run once against a stale null user
  // and never re-run once the real user loads.
  useEffect(() => {
    if (!user?.id) return
    listingsAPI.list().then((res) => {
      const mine = res.data.filter((l) => l.owner_id === user.id)
      setListings(mine)
    }).finally(() => setLoadingList(false))
  }, [success, user?.id])

  // Addendum 5: real confirmed deals for the provider's own listings, with
  // the seeker's actually-selected date/time.
  useEffect(() => {
    if (!user?.id) return
    bookingsAPI.listProvider()
      .then((res) => setProviderBookings(res.data))
      .catch(() => {})
      .finally(() => setLoadingBookings(false))
  }, [success, user?.id])

  // Real dashboard analytics (completed bookings, average rating) — closes
  // the LIST -> ... -> REVIEW -> DASHBOARD ANALYTICS loop with actual backend
  // aggregates, never fabricated placeholder numbers.
  useEffect(() => {
    if (!user?.id) return
    analyticsAPI.getProviderAnalytics().then((res) => setAnalytics(res.data)).catch(() => {})
  }, [success, user?.id])

  // Phase 17 (Addendum 2): real referral code + credit ledger, never fabricated.
  useEffect(() => {
    if (!user?.id) return
    authAPI.referralStatus().then((res) => setReferral(res.data)).catch(() => {})
  }, [user?.id])

  const copyReferralLink = () => {
    if (!referral) return
    navigator.clipboard.writeText(`${window.location.origin}/register?ref=${referral.referral_code}`).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Laya description safety check (debounced)
  useEffect(() => {
    if (form.description.length < 40) { setSafetyNote(null); return }
    const t = setTimeout(async () => {
      setCheckingDesc(true)
      try {
        const res = await listingsAPI.checkSafety(form.description, form.category)
        setSafetyNote(res.data)
      } catch { /* advisory only — never blocks */ }
      finally { setCheckingDesc(false) }
    }, 800)
    return () => clearTimeout(t)
  }, [form.description, form.category])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPhotoError('')
    setPriceError('')
    if (!photoFile) {
      setPhotoError('A photo of the resource is required.')
      return
    }
    // Phase 112: real client-side floor validation, mirroring the backend's
    // own model_validator — the same rule enforced twice, not duplicated logic.
    const pricePerDay = parseFloat(form.price_per_day)
    const providerMin = parseFloat(form.provider_min)
    if (!(providerMin > 0) || providerMin > pricePerDay) {
      setPriceError('Minimum acceptable price cannot exceed the asking price.')
      return
    }
    setSubmitting(true)
    try {
      const created = await listingsAPI.create({
        title: form.title,
        description: form.description,
        category: form.category,
        price_per_day: pricePerDay,
        provider_min: providerMin,
        address: form.address,
        capacity: form.capacity ? parseInt(form.capacity) : null,
        // A pasted maps link takes priority server-side; geolocation is the fallback.
        ...(form.maps_link.trim() ? { maps_link: form.maps_link.trim() } : {}),
        ...(geoCoords ? { lat: geoCoords.lat, lon: geoCoords.lon } : {}),
        ...(form.owner_display_name.trim() ? { owner_display_name: form.owner_display_name.trim() } : {}),
        listing_contact_phone: form.listing_contact_phone.trim(),
      })
      await listingsAPI.uploadImage(created.data.id, photoFile)
      setSuccess(true)
      setShowForm(false)
      setForm({
        title: '', description: '', category: 'banquet_hall', price_per_day: '', provider_min: '', address: '', capacity: '', maps_link: '', owner_display_name: '',
        // Next listing still prefills from the account number, not blank.
        listing_contact_phone: user?.contact_phone ?? '',
      })
      setGeoCoords(null)
      setGeoStatus('idle')
      setSafetyNote(null)
      setPhotoFile(null)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      alert(err?.response?.data?.detail ?? 'Failed to create listing')
    } finally {
      setSubmitting(false)
    }
  }

  const totalRevenue = listings.reduce((sum, l) => sum + l.price_per_day, 0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-lavender/10">
      {/* Nav */}
      <nav className="flex items-center justify-between px-4 py-4 max-w-6xl mx-auto border-b border-lavender/20 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-navy flex items-center justify-center">
            <span className="text-espresso text-sm font-bold">Æ</span>
          </div>
          <span className="font-bold text-navy text-xl">Provider Portal</span>
        </div>
        <div className="flex gap-4 items-center">
          {user?.role === 'both' && (
            <button onClick={() => nav('/seeker')} className="text-sm text-navy font-medium hover:underline">Find Resources</button>
          )}
          <button onClick={() => nav('/audit')} className="text-sm text-navy font-medium hover:underline">Visual Audit</button>
          <span className="text-gray-300">|</span>
          {user && <span className="text-sm font-semibold text-navy bg-navy/10 px-3 py-1.5 rounded-full">{user.display_name}</span>}
          <button onClick={() => { authStore.logout(); nav('/') }} className="text-sm text-navy hover:underline">Sign out</button>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Revenue summary + real dashboard analytics (completed bookings, avg rating) */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Active Listings', value: listings.length, icon: <CheckCircle size={18} className="text-green-500" />, countUp: true },
            { label: 'Combined Daily Rate', value: `₹${totalRevenue.toLocaleString('en-IN')}`, icon: <TrendingUp size={18} className="text-navy" />, countUp: false },
            { label: 'Completed Bookings', value: analytics?.completed_bookings ?? '—', icon: <CalendarCheck size={18} className="text-navy" />, countUp: typeof analytics?.completed_bookings === 'number' },
            {
              label: analytics?.total_reviews ? `Avg Rating (${analytics.total_reviews})` : 'Avg Rating',
              value: analytics?.average_rating != null ? analytics.average_rating.toFixed(1) : 'No reviews yet',
              icon: <Star size={18} className="text-amber-400" />,
              countUp: false,
            },
          ].map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.1 }}
              className="bg-white rounded-2xl p-5 border border-lavender/20 shadow-sm flex items-center gap-3">
              {s.icon}
              <div>
                <div className="text-lg font-bold text-gray-900">
                  {s.countUp && typeof s.value === 'number' ? <AnimatedStatNumber value={s.value} /> : s.value}
                </div>
                <div className="text-xs text-gray-500">{s.label}</div>
              </div>
            </motion.div>
          ))}
          <motion.button
            onClick={() => setShowForm(!showForm)}
            className="bg-navy text-espresso rounded-2xl p-5 flex items-center gap-2 font-semibold hover:bg-navy-light transition-colors shadow-sm"
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          >
            <Plus size={20} /> Add Listing
          </motion.button>
        </div>

        {/* Referral (Phase 17, Addendum 2): real code + ledger credit */}
        {referral && (
          <div className="bg-white rounded-2xl p-5 border border-lavender/20 shadow-sm flex items-center justify-between gap-4 mb-8 flex-wrap">
            <div className="flex items-center gap-3">
              <Gift size={20} className="text-navy shrink-0" />
              <div>
                <div className="text-sm font-semibold text-gray-900">
                  Your referral code: <span className="font-mono">{referral.referral_code}</span>
                </div>
                <div className="text-xs text-gray-500">
                  {referral.total_referred} referred · {referral.credited_referrals} credited · ₹{referral.referral_credit.toLocaleString('en-IN')} earned
                </div>
              </div>
            </div>
            <button
              onClick={copyReferralLink}
              className="flex items-center gap-1.5 text-xs font-medium text-navy border border-navy/20 rounded-full px-3 py-1.5 hover:bg-navy/5 transition-colors"
            >
              <Copy size={13} /> {copied ? 'Copied!' : 'Copy invite link'}
            </button>
          </div>
        )}

        {/* Success toast */}
        <AnimatePresence>
          {success && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-green-50 text-green-700 text-sm rounded-xl px-4 py-3 mb-6 flex items-center gap-2">
              <CheckCircle size={16} /> Listing published successfully!
            </motion.div>
          )}
        </AnimatePresence>

        {/* Listing form */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-8">
              <form onSubmit={submit} className="bg-white rounded-2xl border border-lavender/20 shadow-sm p-6 space-y-4">
                <h2 className="font-bold text-gray-900 text-lg">New Listing</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                    <input value={form.title} onChange={update('title')} required
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-navy"
                      placeholder="Grand Banquet Hall — Andheri" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                      {checkingDesc && <span className="ml-2 text-xs text-gray-400">Checking…</span>}
                    </label>
                    <textarea value={form.description} onChange={update('description')} required rows={4}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-navy resize-none"
                      placeholder="Describe the resource — capacity, facilities, ideal use cases…" />
                    {/* Laya advisory note — never a hard block */}
                    <AnimatePresence>
                      {safetyNote?.flagged && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                          className="mt-2 bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs rounded-xl px-3 py-2 flex items-start gap-2">
                          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                          <span><span className="font-medium">Quick Check:</span> {safetyNote.advisory_note} (Confidence: {(safetyNote.confidence * 100).toFixed(0)}%)</span>
                        </motion.div>
                      )}
                      {/* Addendum 9, Phase 63: Nugen domain-aligned compliance
                          reviewer, labeled distinctly from Laya's quick check
                          above. Absent if Nugen was unreachable — never a
                          fabricated review, and never a hard block either. */}
                      {safetyNote?.domain_review && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                          className="mt-2 bg-sage/10 border border-sage/30 text-gray-700 text-xs rounded-xl px-3 py-2">
                          <p><span className="font-medium">Domain Compliance Review, powered by Nugen:</span> {safetyNote.domain_review}</p>
                          <NugenBadge
                            className="mt-1.5"
                            focus="Domain-aligned safety, hygiene, and regulatory review for hospitality resource listings in India."
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select value={form.category} onChange={update('category')}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-navy bg-white">
                      {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Price per Day (₹)</label>
                    <input type="number" value={form.price_per_day} onChange={update('price_per_day')} required min={1}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-navy"
                      placeholder="25000" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Acceptable Price (₹)</label>
                    <input type="number" value={form.provider_min} onChange={update('provider_min')} required min={1}
                      max={form.price_per_day || undefined}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-navy"
                      placeholder="18750" />
                    <p className="text-xs text-gray-400 mt-1">The real floor a seeker's offer can never go below in negotiation.</p>
                    {priceError && <p className="text-xs text-red-600 mt-1">{priceError}</p>}
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                    <input value={form.address} onChange={update('address')} required
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-navy"
                      placeholder="Lokhandwala Complex, Andheri West, Mumbai" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Location <span className="text-gray-400 font-normal">(paste a Google Maps link, or use your current location)</span>
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={form.maps_link}
                        onChange={update('maps_link')}
                        className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-navy"
                        placeholder="https://maps.google.com/... or a maps.app.goo.gl link"
                      />
                      <button
                        type="button"
                        onClick={useMyLocation}
                        disabled={geoStatus === 'locating'}
                        className="shrink-0 flex items-center gap-1.5 text-sm font-medium text-navy border border-navy/20 rounded-xl px-3 hover:bg-navy/5 transition-colors disabled:opacity-50"
                      >
                        {geoStatus === 'locating'
                          ? <Loader2 size={14} className="animate-spin" />
                          : <LocateFixed size={14} />}
                        Use my location
                      </button>
                    </div>
                    {geoStatus === 'success' && (
                      <p className="flex items-center gap-1 text-xs text-green-600 mt-1">
                        <CheckCircle size={13} /> Current location captured
                      </p>
                    )}
                    {geoStatus === 'error' && (
                      <p className="text-xs text-amber-600 mt-1">Couldn't get your location — paste a Maps link instead, or leave blank and add it later.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Capacity (optional)</label>
                    <input type="number" value={form.capacity} onChange={update('capacity')}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-navy"
                      placeholder="e.g. 200" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      On-Site Contact Name <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input value={form.owner_display_name} onChange={update('owner_display_name')}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-navy"
                      placeholder="Leave blank to use your account name" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Listing Contact Number</label>
                    <input
                      type="tel"
                      value={form.listing_contact_phone}
                      onChange={update('listing_contact_phone')}
                      required
                      pattern="^\+?[\d\s\-()]{7,15}$"
                      title="Enter a valid phone number (7-15 digits, optional +country code)"
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-navy"
                      placeholder="+91 98765 43210"
                    />
                    <p className="text-xs text-gray-400 mt-1">Prefilled from your account — edit if this listing has a different contact.</p>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Photo <span className="text-red-500">(required)</span>
                    </label>
                    <label className="flex items-center gap-2 border border-dashed border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-500 cursor-pointer hover:border-navy hover:text-navy transition-colors">
                      <ImageIcon size={16} />
                      {photoFile ? photoFile.name : 'Choose a photo of the resource…'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => { setPhotoFile(e.target.files?.[0] ?? null); setPhotoError('') }}
                      />
                    </label>
                    {photoError && <p className="text-xs text-red-600 mt-1">{photoError}</p>}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="submit" disabled={submitting}
                    className="bg-navy text-espresso px-6 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50 flex items-center gap-2 hover:bg-navy-light transition-colors">
                    {submitting && <Loader2 size={14} className="animate-spin" />}
                    Publish Listing
                  </button>
                  <button type="button" onClick={() => setShowForm(false)}
                    className="px-6 py-2.5 rounded-xl text-sm text-gray-600 hover:bg-gray-100 transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* My listings */}
        <h2 className="font-bold text-gray-900 text-lg mb-4">My Listings</h2>
        {loadingList ? (
          <div className="space-y-3">
            {[1,2].map(i => <div key={i} className="h-20 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p>No listings yet. Add your first resource above.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {listings.map((l, i) => (
              <motion.div key={l.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                className="bg-white rounded-2xl border border-lavender/20 shadow-sm p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {l.image_path ? (
                      <img src={listingImageUrl(l.image_path)} alt={l.title}
                        className="w-14 h-14 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                        <ImageIcon size={18} className="text-gray-300" />
                      </div>
                    )}
                    <div>
                      <h3 className="font-semibold text-gray-900">{l.title}</h3>
                      <p className="text-xs text-gray-400 mt-0.5">{l.category} · {l.address}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-navy">₹{l.price_per_day.toLocaleString('en-IN')}/day</div>
                    <span className="text-xs text-green-600 font-medium">Active</span>
                  </div>
                </div>
                <RecurringAvailabilityControl assetId={l.id} />
                <AvailabilityWindowControl assetId={l.id} />
              </motion.div>
            ))}
          </div>
        )}

        {/* Confirmed deals (Addendum 5): real bookings on the provider's own
            listings, with the seeker's actually-selected date/time. */}
        <h2 className="font-bold text-gray-900 text-lg mb-4 mt-10">Confirmed Deals</h2>
        {loadingBookings ? (
          <div className="h-16 bg-white rounded-2xl border border-gray-100 animate-pulse" />
        ) : providerBookings.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <p>No confirmed deals yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {providerBookings.map((b) => (
              <div key={b.id} className="bg-white rounded-2xl border border-lavender/20 shadow-sm p-4 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm">{b.asset_title ?? 'Listing'}</h3>
                  <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                    <UserIcon size={11} /> {b.seeker_name} ({b.seeker_email})
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(b.starts_at).toLocaleString('en-IN')} → {new Date(b.ends_at).toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="text-right shrink-0 text-xs">
                  <span className={`inline-block px-2 py-0.5 rounded-full font-medium ${
                    b.payment_status === 'paid' ? 'bg-green-100 text-green-700' :
                    b.payment_status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {b.payment_status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
