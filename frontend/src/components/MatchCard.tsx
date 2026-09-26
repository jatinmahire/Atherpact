/**
 * AetherPact — Match Result Card.
 * Shows a listing with animated score bars and an expandable "why this match?" panel.
 * Scores come from the real /match response — no fabrication.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, MapPin, Cpu } from 'lucide-react'
import type { MatchResultItem } from '../api/client'

const CATEGORY_LABELS: Record<string, string> = {
  banquet_hall: '🏛️ Banquet Hall',
  commercial_kitchen: '🍳 Commercial Kitchen',
  av_equipment: '🎤 AV Equipment',
  transportation: '🚐 Transportation',
  event_space: '🌆 Event Space',
}

interface Props {
  item: MatchResultItem
  rank: number
  onNegotiate?: (item: MatchResultItem) => void
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{label}</span>
        <span className="font-medium">{(value * 100).toFixed(1)}%</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${value * 100}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}

export default function MatchCard({ item, rank, onNegotiate }: Props) {
  const [expanded, setExpanded] = useState(false)
  const nav = useNavigate()
  const { asset, scores } = item

  const badgeColor =
    scores.final_score >= 0.75 ? 'bg-green-100 text-green-700' :
    scores.final_score >= 0.5  ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-gray-100 text-gray-600'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.08, duration: 0.4 }}
      className="bg-white rounded-2xl shadow-sm border border-lavender/30 overflow-hidden hover:shadow-md transition-shadow"
    >
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-gray-400">#{rank + 1}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-lavender/30 text-navy font-medium">
                {CATEGORY_LABELS[asset.category] ?? asset.category}
              </span>
            </div>
            <h3 className="font-semibold text-gray-900 text-lg leading-tight cursor-pointer hover:text-navy transition-colors"
              onClick={() => nav(`/listing/${asset.id}`, { state: { matchItem: item } })}>
              {asset.title}
            </h3>
            <p className="text-gray-500 text-sm mt-1 flex items-center gap-1">
              <MapPin size={12} /> {asset.address}
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xl font-bold text-navy">
              ₹{asset.price_per_day.toLocaleString('en-IN')}
            </div>
            <div className="text-xs text-gray-400">per day</div>
            <span className={`inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>
              {(scores.final_score * 100).toFixed(0)}% match
            </span>
          </div>
        </div>

        <p className="text-gray-600 text-sm mt-3 leading-relaxed line-clamp-2">
          {asset.description}
        </p>

        {asset.capacity && (
          <p className="text-xs text-gray-400 mt-2">Capacity: {asset.capacity} guests</p>
        )}

        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-navy font-medium hover:text-navy-light transition-colors"
          >
            <Cpu size={13} />
            Why this match?
            <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown size={13} />
            </motion.span>
          </button>
          {onNegotiate && (
            <button
              onClick={() => onNegotiate(item)}
              className="ml-auto text-xs bg-navy text-white px-4 py-1.5 rounded-full font-medium hover:bg-navy-light transition-colors"
            >
              Negotiate
            </button>
          )}
        </div>
      </div>

      {/* Expandable score breakdown */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-0 border-t border-gray-50">
              <p className="text-xs text-gray-400 mb-3 mt-3 font-medium uppercase tracking-wide">
                Score Breakdown (real computed values)
              </p>
              <ScoreBar label="Semantic Relevance" value={scores.semantic_score} color="#3A4876" />
              <ScoreBar label="Price Match"        value={scores.price_score}    color="#C7CEEA" />
              <ScoreBar label="Location Proximity" value={scores.distance_score} color="#6c75a8" />
              <div className="mt-3 pt-3 border-t border-gray-100">
                <ScoreBar label="Overall Score (0.5·sem + 0.3·price + 0.2·dist)" value={scores.final_score} color="#2a3560" />
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Matching uses <code className="bg-gray-100 px-1 rounded">all-MiniLM-L6-v2</code> embeddings
                + haversine distance — computed live, never hardcoded.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
