/**
 * AetherPact — Seeker Portal.
 * Search form → ranked match cards with animated score bars → Negotiate modal.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Loader2 } from 'lucide-react'
import { matchAPI } from '../api/client'
import type { MatchResultItem } from '../api/client'
import { authStore } from '../store/auth'
import MatchCard from '../components/MatchCard'
import { SkeletonList } from '../components/SkeletonCard'
import NegotiatePage from './NegotiatePage'

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
      <nav className="flex items-center justify-between px-8 py-5 max-w-6xl mx-auto border-b border-lavender/20 bg-white/80 backdrop-blur sticky top-0 z-10">
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

      <main className="max-w-4xl mx-auto px-8 py-10">
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

        {/* Results */}
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
