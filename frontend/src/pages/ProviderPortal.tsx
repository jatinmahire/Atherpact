/**
 * AetherPact — Provider Portal.
 * Listing form (with Laya safety advisory), list of own listings, revenue summary.
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Loader2, AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react'
import { listingsAPI } from '../api/client'
import type { Listing } from '../api/client'
import { authStore } from '../store/auth'
import { useNavigate } from 'react-router-dom'

const CATEGORIES = [
  { value: 'banquet_hall',      label: '🏛️ Banquet Hall' },
  { value: 'commercial_kitchen', label: '🍳 Commercial Kitchen' },
  { value: 'av_equipment',      label: '🎤 AV & Event Equipment' },
  { value: 'transportation',    label: '🚐 Transportation / Fleet' },
  { value: 'event_space',       label: '🌆 Rooftop / Event Space' },
  { value: 'other',             label: '📦 Other' },
]

interface SafetyNote {
  flagged: boolean
  advisory_note: string | null
  confidence: number
}

export default function ProviderPortal() {
  const nav  = useNavigate()
  const [user, setUser] = useState(authStore.getUser())

  useEffect(() => {
    return authStore.subscribe(() => setUser(authStore.getUser()))
  }, [])

  useEffect(() => {
    if (!authStore.getToken()) nav('/login')
  }, [])

  const [listings, setListings]         = useState<Listing[]>([])
  const [loadingList, setLoadingList]   = useState(true)
  const [showForm, setShowForm]         = useState(false)
  const [safetyNote, setSafetyNote]     = useState<SafetyNote | null>(null)
  const [submitting, setSubmitting]     = useState(false)
  const [checkingDesc, setCheckingDesc] = useState(false)
  const [success, setSuccess]           = useState(false)

  const [form, setForm] = useState({
    title: '', description: '', category: 'banquet_hall',
    price_per_day: '', lat: '19.0760', lon: '72.8777',
    address: '', capacity: '',
  })

  const update = (field: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }))

  // Load own listings
  useEffect(() => {
    listingsAPI.list().then((res) => {
      const mine = res.data.filter((l) => l.owner_id === user?.id)
      setListings(mine)
    }).finally(() => setLoadingList(false))
  }, [success])

  // Laya description safety check (debounced)
  useEffect(() => {
    if (form.description.length < 40) { setSafetyNote(null); return }
    const t = setTimeout(async () => {
      setCheckingDesc(true)
      try {
        const res = await listingsAPI.checkSafety(form.description)
        setSafetyNote(res.data)
      } catch { /* advisory only — never blocks */ }
      finally { setCheckingDesc(false) }
    }, 800)
    return () => clearTimeout(t)
  }, [form.description])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await listingsAPI.create({
        title: form.title,
        description: form.description,
        category: form.category,
        price_per_day: parseFloat(form.price_per_day),
        lat: parseFloat(form.lat),
        lon: parseFloat(form.lon),
        address: form.address,
        capacity: form.capacity ? parseInt(form.capacity) : null,
      })
      setSuccess(true)
      setShowForm(false)
      setForm({ title: '', description: '', category: 'banquet_hall', price_per_day: '', lat: '19.0760', lon: '72.8777', address: '', capacity: '' })
      setSafetyNote(null)
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
      <nav className="flex items-center justify-between px-8 py-5 max-w-6xl mx-auto border-b border-lavender/20 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-navy flex items-center justify-center">
            <span className="text-white text-sm font-bold">Æ</span>
          </div>
          <span className="font-bold text-navy text-xl">Provider Portal</span>
        </div>
        <div className="flex gap-4 items-center">
          <button onClick={() => nav('/seeker')} className="text-sm text-navy font-medium hover:underline">Find Resources</button>
          <button onClick={() => nav('/audit')} className="text-sm text-navy font-medium hover:underline">Visual Audit</button>
          <span className="text-gray-300">|</span>
          <span className="text-sm text-gray-500">{user?.display_name ?? 'Provider'}</span>
          <button onClick={() => { authStore.logout(); nav('/') }} className="text-sm text-navy hover:underline">Sign out</button>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-8 py-10">
        {/* Revenue summary */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Active Listings', value: listings.length, icon: <CheckCircle size={18} className="text-green-500" /> },
            { label: 'Combined Daily Rate', value: `₹${totalRevenue.toLocaleString('en-IN')}`, icon: <TrendingUp size={18} className="text-navy" /> },
          ].map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.1 }}
              className="bg-white rounded-2xl p-5 border border-lavender/20 shadow-sm flex items-center gap-3">
              {s.icon}
              <div>
                <div className="text-lg font-bold text-gray-900">{s.value}</div>
                <div className="text-xs text-gray-500">{s.label}</div>
              </div>
            </motion.div>
          ))}
          <motion.button
            onClick={() => setShowForm(!showForm)}
            className="bg-navy text-white rounded-2xl p-5 flex items-center gap-2 font-semibold hover:bg-navy-light transition-colors shadow-sm"
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          >
            <Plus size={20} /> Add Listing
          </motion.button>
        </div>

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
                          <span>{safetyNote.advisory_note} (Confidence: {(safetyNote.confidence * 100).toFixed(0)}%)</span>
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
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                    <input value={form.address} onChange={update('address')} required
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-navy"
                      placeholder="Lokhandwala Complex, Andheri West, Mumbai" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
                    <input type="number" step="any" value={form.lat} onChange={update('lat')} required
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-navy" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
                    <input type="number" step="any" value={form.lon} onChange={update('lon')} required
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-navy" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Capacity (optional)</label>
                    <input type="number" value={form.capacity} onChange={update('capacity')}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-navy"
                      placeholder="e.g. 200" />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="submit" disabled={submitting}
                    className="bg-navy text-white px-6 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50 flex items-center gap-2 hover:bg-navy-light transition-colors">
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
                className="bg-white rounded-2xl border border-lavender/20 shadow-sm p-5 flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-gray-900">{l.title}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{l.category} · {l.address}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-navy">₹{l.price_per_day.toLocaleString('en-IN')}/day</div>
                  <span className="text-xs text-green-600 font-medium">Active</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
