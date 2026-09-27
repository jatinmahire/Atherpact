/**
 * AetherPact — Seeker Portal.
 * Search form → ranked match cards with animated score bars → Negotiate modal.
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Loader2, MapPin, LocateFixed, CloudRain, Check } from 'lucide-react'
import { matchAPI, listingsAPI, weatherTwinAPI } from '../api/client'
import type { MatchResultItem, Listing, WeatherTwinListing } from '../api/client'
import { authStore } from '../store/auth'
import { simulationStore } from '../store/simulation'
import { deriveAdvisoryTag } from '../lib/weatherAdvisory'
import MatchCard from '../components/MatchCard'
import { SkeletonList } from '../components/SkeletonCard'
import NegotiatePage from './NegotiatePage'
import { CategoryIcon, CATEGORY_LABELS } from '../lib/categoryIcons'


/** Plain listing card for the default "browse all" view — no match score,
 * since no search query has been run. Never fabricates a score to fill
 * this in; that's what MatchCard (used once a real search runs) is for. */
function ListingBrowseCard({ listing, rank, advisoryTag, onNegotiate }: { listing: Listing; rank: number; advisoryTag?: string | null; onNegotiate?: () => void }) {
  const nav = useNavigate()
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.05, duration: 0.3 }}
      className="bg-white rounded-2xl shadow-sm border border-lavender/30 p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <span className="flex items-center gap-1 w-fit text-xs px-2 py-0.5 rounded-full bg-lavender/30 text-navy font-medium">
            <CategoryIcon category={listing.category} size={12} />
            {CATEGORY_LABELS[listing.category] ?? listing.category}
          </span>
          <h3 className="font-semibold text-gray-900 text-lg leading-tight mt-1 cursor-pointer hover:text-navy transition-colors"
            onClick={() => nav(`/listing/${listing.id}`)}>
            {listing.title}
          </h3>
          <p className="text-gray-500 text-sm mt-1 flex items-center gap-1">
            <MapPin size={12} /> {listing.address}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xl font-bold text-navy">₹{listing.price_per_day.toLocaleString('en-IN')}</div>
          <div className="text-xs text-gray-400">per day</div>
        </div>
      </div>
      {/* Addendum 10, Phase 75: derived mechanically from the real
          severity/demand_impact values already computed server-side —
          never a fabricated message. */}
      {advisoryTag && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-wine bg-wine/10 rounded-lg px-2.5 py-1.5 w-fit">
          <CloudRain size={12} className="shrink-0" /> {advisoryTag}
        </div>
      )}
      <p className="text-gray-600 text-sm mt-3 leading-relaxed line-clamp-2">{listing.description}</p>
      {listing.capacity && (
        <p className="text-xs text-gray-400 mt-2">Capacity: {listing.capacity} guests</p>
      )}
      {onNegotiate && (
        <div className="mt-4 flex justify-end">
          <button onClick={onNegotiate}
            className="text-xs bg-navy text-espresso px-4 py-1.5 rounded-full font-medium hover:bg-navy-light transition-colors">
            Negotiate
          </button>
        </div>
      )}
    </motion.div>
  )
}

type SortOption = 'best_match' | 'price_asc' | 'price_desc'

export default function SeekerPortal() {
  const nav  = useNavigate()
  const user = authStore.getUser()

  const [query, setQuery]       = useState('')
  const [budget, setBudget]     = useState('')
  const [results, setResults]   = useState<MatchResultItem[]>([])
  const [loading, setLoading]   = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError]       = useState('')
  const [negotiating, setNegotiating] = useState<MatchResultItem | null>(null)

  // Real, backend-backed filters only (Phase 22, Addendum 3): category maps
  // to GET /listings?category= server-side; capacity/sort are real client-
  // side operations over the real returned fields. No location-text geocode
  // or rating filter here — /match doesn't return per-listing rating or
  // accept a location string today, and fabricating that UI would violate
  // "the frontend never computes/invents a score."
  const [category, setCategory] = useState('')
  const [minCapacity, setMinCapacity] = useState('')
  const [sort, setSort] = useState<SortOption>('best_match')

  // Phase 36 (Addendum 4): real distance scoring needs the seeker's own
  // location — captured only via the browser's own geolocation, never typed.
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

  // Default "browse all" view — every active listing, newest first, shown
  // until a real search is run. Without this, a page titled "Browse
  // Available Resources" showed nothing at all (including newly created
  // listings) until the user happened to type a matching query.
  const [allListings, setAllListings] = useState<Listing[]>([])
  const [loadingAll, setLoadingAll]   = useState(true)

  useEffect(() => {
    setLoadingAll(true)
    listingsAPI.list(category || undefined)
      .then((res) => setAllListings(res.data))
      .catch(() => {})
      .finally(() => setLoadingAll(false))
  }, [category])

  // Addendum 10, Phase 75: real weather-impact lookup for the advisory
  // tags below, reusing the same Phase 68/69 twin-snapshot endpoint and
  // re-fetched whenever the global Simulation Mode changes so tags update
  // together with the rest of the app.
  const [weatherImpact, setWeatherImpact] = useState<Map<string, WeatherTwinListing>>(new Map())
  const [simMode, setSimMode] = useState(simulationStore.getMode())
  useEffect(() => simulationStore.subscribe(() => setSimMode(simulationStore.getMode())), [])
  useEffect(() => {
    weatherTwinAPI.snapshot(simMode ?? 'normal')
      .then((res) => setWeatherImpact(new Map(res.data.listings.map((l) => [l.asset_id, l]))))
      .catch(() => {})
  }, [simMode])

  const search = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setError('')
    setSearched(true)
    try {
      const res = await matchAPI.match(query.trim(), parseFloat(budget) || 0, geoCoords?.lat, geoCoords?.lon)
      setResults(res.data.results)
    } catch {
      setError('Search failed. Make sure the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  const cap = minCapacity ? parseInt(minCapacity) : 0
  const visibleListings = allListings.filter((l) => !cap || (l.capacity ?? 0) >= cap)
  const visibleResults = results
    .filter((r) => (!category || r.asset.category === category) && (!cap || (r.asset.capacity ?? 0) >= cap))
    .sort((a, b) => {
      if (sort === 'price_asc') return a.asset.price_per_day - b.asset.price_per_day
      if (sort === 'price_desc') return b.asset.price_per_day - a.asset.price_per_day
      return b.scores.final_score - a.scores.final_score
    })

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-lavender/10">
      {/* Nav */}
      <nav className="flex items-center justify-between px-4 py-4 max-w-6xl mx-auto border-b border-lavender/20 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => nav('/')}>
          <div className="w-8 h-8 rounded-lg bg-navy flex items-center justify-center">
            <span className="text-espresso text-sm font-bold">Æ</span>
          </div>
          <span className="font-bold text-navy text-xl">AetherPact</span>
        </div>
        <div className="flex gap-4 items-center">
          <button onClick={() => nav('/provider')} className="text-sm text-navy font-medium hover:underline">Provider Portal</button>
          <button onClick={() => nav('/audit')} className="text-sm text-navy font-medium hover:underline">Visual Audit</button>
          <span className="text-gray-300">|</span>
          {user ? (
            <span className="text-sm font-semibold text-navy bg-navy/10 px-3 py-1.5 rounded-full">{user.display_name}</span>
          ) : (
            <span className="text-sm text-gray-500">Guest</span>
          )}
          {user ? (
            <button onClick={() => { authStore.logout(); nav('/') }} className="text-sm text-navy hover:underline">Sign out</button>
          ) : (
            <button onClick={() => nav('/login')} className="text-sm bg-navy text-espresso px-4 py-2 rounded-full font-medium hover:bg-navy-light transition-colors">Sign In</button>
          )}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Find Resources</h1>
          <p className="text-gray-500 mb-6">
            Semantic search powered by <code className="bg-gray-100 px-1 rounded text-xs">all-MiniLM-L6-v2</code>.
            Scores are computed live — never hardcoded.
          </p>
        </motion.div>

        {/* Search form */}
        <form onSubmit={search} className="bg-white rounded-2xl shadow-sm border border-lavender/20 p-5 mb-6">
          <div className="flex gap-3">
            <div className="flex-1">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. 'FSSAI-certified kitchen in Bandra for cloud kitchen startup'"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-navy"
              />
            </div>
            <div className="w-40">
              <input
                type="number"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="Budget ₹/day"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-navy"
              />
            </div>
            <button
              type="button"
              onClick={useMyLocation}
              disabled={geoStatus === 'locating'}
              title="Use my current location to rank results by distance"
              className={`shrink-0 flex items-center gap-1.5 px-3 rounded-xl text-sm font-medium border transition-colors disabled:opacity-50 ${
                geoStatus === 'success' ? 'border-green-300 text-green-700 bg-green-50' : 'border-gray-200 text-navy hover:bg-navy/5'
              }`}
            >
              {geoStatus === 'locating' ? <Loader2 size={14} className="animate-spin" /> : <LocateFixed size={14} />}
            </button>
            <button type="submit" disabled={loading || !query.trim()}
              className="bg-navy text-espresso px-6 py-3 rounded-xl font-semibold text-sm disabled:opacity-40 flex items-center gap-2 hover:bg-navy-light transition-colors shrink-0">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Search
            </button>
          </div>
          {geoStatus === 'success' && (
            <p className="flex items-center gap-1 text-xs text-green-600 mt-2">
              <Check size={13} /> Using your current location to rank results by distance
            </p>
          )}
          {geoStatus === 'error' && (
            <p className="text-xs text-amber-600 mt-2">Couldn't get your location — search still works, just without distance ranking.</p>
          )}
        </form>

        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
          {/* Real, backend-backed filters — category maps to GET /listings?category=,
              capacity/sort are real client-side operations over real returned fields */}
          <aside className="bg-white rounded-2xl border border-lavender/20 shadow-sm p-4 h-fit space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Resource Type</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy">
                <option value="">All types</option>
                {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Min. Capacity</label>
              <input type="number" value={minCapacity} onChange={(e) => setMinCapacity(e.target.value)}
                placeholder="Any"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-navy" />
            </div>
            {searched && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Sort</label>
                <select value={sort} onChange={(e) => setSort(e.target.value as SortOption)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-navy">
                  <option value="best_match">Best Match</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                </select>
              </div>
            )}
          </aside>

          <div>
            {/* Browse-all view — shown until a real search is run, so newly
                uploaded/updated listings are visible immediately, latest first */}
            {!searched && (
              loadingAll ? (
                <SkeletonList count={3} />
              ) : visibleListings.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <Search size={40} className="mx-auto mb-3 opacity-40" />
                  <p>No resources match these filters.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-gray-400">
                    {visibleListings.length} listed resources · newest first — search above to rank by fit
                  </p>
                  {visibleListings.map((listing, i) => (
                    <ListingBrowseCard
                      key={listing.id}
                      listing={listing}
                      rank={i}
                      advisoryTag={deriveAdvisoryTag(weatherImpact.get(listing.id))}
                      onNegotiate={user ? () => setNegotiating({
                        asset: listing,
                        scores: { semantic_score: 0, price_score: 0, distance_score: 0, final_score: 0 },
                      }) : undefined}
                    />
                  ))}
                </div>
              )
            )}

            {/* Search results */}
            {loading && <SkeletonList count={3} />}

            {!loading && error && (
              <div className="text-red-600 bg-red-50 rounded-xl px-4 py-3 text-sm">{error}</div>
            )}

            {!loading && searched && !error && (
              <AnimatePresence>
                {visibleResults.length === 0 ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="text-center py-16 text-gray-400">
                    <Search size={40} className="mx-auto mb-3 opacity-40" />
                    <p>No matching resources found.</p>
                    <ul className="text-xs text-gray-400 mt-2 space-y-0.5">
                      <li>Try a different query or increase your budget</li>
                      <li>Clear the resource type or capacity filter</li>
                    </ul>
                  </motion.div>
                ) : (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                    <p className="text-sm text-gray-400">
                      {visibleResults.length} matches · sorted by {sort === 'best_match' ? 'final score' : 'price'}
                    </p>
                    {visibleResults.map((item, i) => (
                      <MatchCard
                        key={item.asset.id}
                        item={item}
                        rank={i}
                        advisoryTag={deriveAdvisoryTag(weatherImpact.get(item.asset.id))}
                        onNegotiate={user ? setNegotiating : undefined}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>
        </div>
      </main>

      {/* Negotiate modal */}
      <AnimatePresence>
        {negotiating && (
          <NegotiatePage item={negotiating} onClose={() => setNegotiating(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}
