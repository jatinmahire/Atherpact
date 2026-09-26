/**
 * AetherPact — Seeker Portal.
 * Search form → ranked match cards with animated score bars → Negotiate modal.
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Loader2, MapPin } from 'lucide-react'
import { matchAPI, listingsAPI } from '../api/client'
import type { MatchResultItem, Listing } from '../api/client'
import { authStore } from '../store/auth'
import MatchCard from '../components/MatchCard'
import { SkeletonList } from '../components/SkeletonCard'
import NegotiatePage from './NegotiatePage'

const CATEGORY_LABELS: Record<string, string> = {
  banquet_hall: '🏛️ Banquet Hall',
  commercial_kitchen: '🍳 Commercial Kitchen',
  av_equipment: '🎤 AV Equipment',
  transportation: '🚐 Transportation',
  event_space: '🌆 Event Space',
}

/** Plain listing card for the default "browse all" view — no match score,
 * since no search query has been run. Never fabricates a score to fill
 * this in; that's what MatchCard (used once a real search runs) is for. */
function ListingBrowseCard({ listing, rank, onNegotiate }: { listing: Listing; rank: number; onNegotiate?: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.05, duration: 0.3 }}
      className="bg-white rounded-2xl shadow-sm border border-lavender/30 p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <span className="text-xs px-2 py-0.5 rounded-full bg-lavender/30 text-navy font-medium">
            {CATEGORY_LABELS[listing.category] ?? listing.category}
          </span>
          <h3 className="font-semibold text-gray-900 text-lg leading-tight mt-1">{listing.title}</h3>
          <p className="text-gray-500 text-sm mt-1 flex items-center gap-1">
            <MapPin size={12} /> {listing.address}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xl font-bold text-navy">₹{listing.price_per_day.toLocaleString('en-IN')}</div>
          <div className="text-xs text-gray-400">per day</div>
        </div>
      </div>
      <p className="text-gray-600 text-sm mt-3 leading-relaxed line-clamp-2">{listing.description}</p>
      {listing.capacity && (
        <p className="text-xs text-gray-400 mt-2">Capacity: {listing.capacity} guests</p>
      )}
      {onNegotiate && (
        <div className="mt-4 flex justify-end">
          <button onClick={onNegotiate}
            className="text-xs bg-navy text-white px-4 py-1.5 rounded-full font-medium hover:bg-navy-light transition-colors">
            Negotiate
          </button>
        </div>
      )}
    </motion.div>
  )
}

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

  // Default "browse all" view — every active listing, newest first, shown
  // until a real search is run. Without this, a page titled "Browse
  // Available Resources" showed nothing at all (including newly created
  // listings) until the user happened to type a matching query.
  const [allListings, setAllListings] = useState<Listing[]>([])
  const [loadingAll, setLoadingAll]   = useState(true)

  useEffect(() => {
    listingsAPI.list()
      .then((res) => setAllListings(res.data))
      .catch(() => {})
      .finally(() => setLoadingAll(false))
  }, [])

  const search = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setError('')
    setSearched(true)
    try {
      const res = await matchAPI.match(query.trim(), parseFloat(budget) || 0)
      setResults(res.data.results)
    } catch {
      setError('Search failed. Make sure the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-lavender/10">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto border-b border-lavender/20 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => nav('/')}>
          <div className="w-8 h-8 rounded-lg bg-navy flex items-center justify-center">
            <span className="text-white text-sm font-bold">Æ</span>
          </div>
          <span className="font-bold text-navy text-xl">AetherPact</span>
        </div>
        <div className="flex gap-4 items-center">
          <button onClick={() => nav('/provider')} className="text-sm text-navy font-medium hover:underline">Provider Portal</button>
          <button onClick={() => nav('/audit')} className="text-sm text-navy font-medium hover:underline">Visual Audit</button>
          <span className="text-gray-300">|</span>
          <span className="text-sm text-gray-500">{user?.display_name ?? 'Guest'}</span>
          {user ? (
            <button onClick={() => { authStore.logout(); nav('/') }} className="text-sm text-navy hover:underline">Sign out</button>
          ) : (
            <button onClick={() => nav('/login')} className="text-sm bg-navy text-white px-4 py-2 rounded-full font-medium hover:bg-navy-light transition-colors">Sign In</button>
          )}
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Find Resources</h1>
          <p className="text-gray-500 mb-8">
            Semantic search powered by <code className="bg-gray-100 px-1 rounded text-xs">all-MiniLM-L6-v2</code>.
            Scores are computed live — never hardcoded.
          </p>
        </motion.div>

        {/* Search form */}
        <form onSubmit={search} className="bg-white rounded-2xl shadow-sm border border-lavender/20 p-5 mb-8">
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
            <button type="submit" disabled={loading || !query.trim()}
              className="bg-navy text-white px-6 py-3 rounded-xl font-semibold text-sm disabled:opacity-40 flex items-center gap-2 hover:bg-navy-light transition-colors shrink-0">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Search
            </button>
          </div>
        </form>

        {/* Browse-all view — shown until a real search is run, so newly
            uploaded/updated listings are visible immediately, latest first */}
        {!searched && (
          loadingAll ? (
            <SkeletonList count={3} />
          ) : allListings.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Search size={40} className="mx-auto mb-3 opacity-40" />
              <p>No resources listed yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                All {allListings.length} listed resources · newest first — search above to rank by fit
              </p>
              {allListings.map((listing, i) => (
                <ListingBrowseCard
                  key={listing.id}
                  listing={listing}
                  rank={i}
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
            {results.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="text-center py-16 text-gray-400">
                <Search size={40} className="mx-auto mb-3 opacity-40" />
                <p>No matching resources found. Try a different query.</p>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <p className="text-sm text-gray-400">
                  Top {results.length} matches · sorted by final score
                </p>
                {results.map((item, i) => (
                  <MatchCard
                    key={item.asset.id}
                    item={item}
                    rank={i}
                    onNegotiate={user ? setNegotiating : undefined}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        )}
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
