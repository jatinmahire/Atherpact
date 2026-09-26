/**
 * AetherPact — Listing Details (Phase 22, Addendum 3 / reference image panel 3).
 *
 * Honesty notes: the schema has no image_url field (no real photos to gallery)
 * and no saved-listings/messaging backend — so this page shows a category icon
 * instead of a fake photo, and omits "Save"/"Contact Provider" buttons rather
 * than ship dead ones. The Verified badge and "you might also need" bundling
 * section ARE real (Phase 15/17, Addendum 2's trust connectors + booking
 * co-occurrence), same as the real GET /reviews/{provider_id} and
 * GET /listings/{id}/recurring-availability data already shown here.
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { MapPin, Loader2, Star, Repeat, BadgeCheck } from 'lucide-react'
import { listingsAPI, reviewsAPI, listingImageUrl } from '../api/client'
import type { Listing, ProviderReviews, RecurringAvailabilityRule, MatchResultItem, BundlingSuggestion } from '../api/client'
import { authStore } from '../store/auth'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import ErrorState from '../components/ErrorState'
import NegotiatePage from './NegotiatePage'

const CATEGORY_ICON: Record<string, string> = {
  banquet_hall: '🏛️', commercial_kitchen: '🍳', av_equipment: '🎤',
  transportation: '🚐', event_space: '🌆',
}
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const location = useLocation() as { state?: { matchItem?: MatchResultItem } }
  const user = authStore.getUser()

  const [listing, setListing] = useState<Listing | null>(null)
  const [reviews, setReviews] = useState<ProviderReviews | null>(null)
  const [rules, setRules] = useState<RecurringAvailabilityRule[]>([])
  const [bundling, setBundling] = useState<BundlingSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [negotiating, setNegotiating] = useState<MatchResultItem | null>(null)

  const load = () => {
    if (!id) return
    setLoading(true)
    setError(false)
    listingsAPI.get(id)
      .then((res) => {
        setListing(res.data)
        Promise.all([
          reviewsAPI.getForProvider(res.data.owner_id).then((r) => setReviews(r.data)).catch(() => {}),
          listingsAPI.listRecurringAvailability(res.data.id).then((r) => setRules(r.data)).catch(() => {}),
          listingsAPI.getBundling(res.data.id).then((r) => setBundling(r.data)).catch(() => {}),
        ])
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  useEffect(load, [id])

  const matchScores = location.state?.matchItem?.scores

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-lavender/10">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-16 flex justify-center"><Loader2 className="animate-spin text-navy" size={28} /></main>
    </div>
  )

  if (error || !listing) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-lavender/10">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-16"><ErrorState message="Could not load this listing." onRetry={load} /></main>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-lavender/10">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
        <div>
          {listing.image_path ? (
            <img src={listingImageUrl(listing.image_path)} alt={listing.title}
              className="w-full h-56 rounded-2xl object-cover mb-6" />
          ) : (
            <div className="w-full h-56 rounded-2xl bg-lavender/20 flex items-center justify-center text-7xl mb-6">
              {CATEGORY_ICON[listing.category] ?? '📦'}
            </div>
          )}

          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">{listing.title}</h1>
            {listing.owner_verified && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">
                <BadgeCheck size={13} /> Verified Provider
              </span>
            )}
          </div>
          <p className="text-gray-500 text-sm flex items-center gap-1 mb-4">
            <MapPin size={13} /> {listing.address}
            {listing.maps_link && (
              <a href={listing.maps_link} target="_blank" rel="noopener noreferrer"
                className="text-navy font-medium hover:underline ml-1">
                View on Google Maps
              </a>
            )}
          </p>

          {reviews && reviews.total_reviews > 0 && (
            <div className="flex items-center gap-1.5 mb-4 text-sm">
              <Star size={15} className="fill-amber-400 text-amber-400" />
              <span className="font-semibold text-gray-900">{reviews.average_rating?.toFixed(1)}</span>
              <span className="text-gray-400">({reviews.total_reviews} review{reviews.total_reviews !== 1 ? 's' : ''})</span>
            </div>
          )}

          <p className="text-gray-600 leading-relaxed mb-4">{listing.description}</p>
          {listing.capacity && <p className="text-sm text-gray-500 mb-4">Capacity: {listing.capacity} guests</p>}

          {rules.length > 0 && (
            <div className="bg-white rounded-2xl border border-lavender/20 p-4 mb-6">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Repeat size={12} /> Standing Unavailable Blocks
              </p>
              <div className="flex flex-wrap gap-2">
                {rules.map((r) => (
                  <span key={r.id} className="text-xs bg-gray-50 rounded-full px-3 py-1">
                    {WEEKDAYS[r.day_of_week]} {r.start_time}–{r.end_time}
                  </span>
                ))}
              </div>
            </div>
          )}

          {matchScores && (
            <div className="bg-navy/5 rounded-2xl border border-navy/10 p-4 mb-6">
              <p className="text-xs font-semibold text-navy uppercase tracking-wide mb-2">Why this matches your requirement</p>
              <div className="grid grid-cols-3 gap-3 text-center text-xs">
                <div><div className="font-bold text-gray-900">{(matchScores.semantic_score * 100).toFixed(0)}%</div>Semantic</div>
                <div><div className="font-bold text-gray-900">{(matchScores.price_score * 100).toFixed(0)}%</div>Price Fit</div>
                <div>
                  {listing.lat == null || listing.lon == null
                    ? <div className="font-bold text-gray-400 italic text-[11px] leading-tight">Location<br />pending</div>
                    : <div className="font-bold text-gray-900">{(matchScores.distance_score * 100).toFixed(0)}%</div>}
                  Distance
                </div>
              </div>
            </div>
          )}

          {bundling.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                You might also need
              </p>
              <div className="flex flex-wrap gap-2">
                {bundling.map((b) => (
                  <button
                    key={b.asset_id}
                    onClick={() => nav(`/listing/${b.asset_id}`)}
                    className="text-left bg-white rounded-xl border border-lavender/20 px-3 py-2 hover:shadow-sm transition-shadow"
                  >
                    <span className="text-sm font-medium text-gray-900">{CATEGORY_ICON[b.category] ?? '📦'} {b.title}</span>
                    <span className="block text-xs text-gray-400 mt-0.5">
                      Booked together {b.co_occurrence_count} time{b.co_occurrence_count !== 1 ? 's' : ''}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {reviews && reviews.reviews.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recent Reviews</p>
              <div className="space-y-2">
                {reviews.reviews.slice(0, 5).map((r) => (
                  <div key={r.id} className="bg-white rounded-xl border border-gray-100 p-3">
                    <div className="flex items-center gap-1 mb-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} size={11} className={i < r.score ? 'fill-amber-400 text-amber-400' : 'text-gray-200'} />
                      ))}
                    </div>
                    {r.comment && <p className="text-sm text-gray-600">{r.comment}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-lavender/20 shadow-sm p-5 h-fit sticky top-24">
          <div className="text-2xl font-bold text-navy">₹{listing.price_per_day.toLocaleString('en-IN')}<span className="text-sm font-normal text-gray-400">/day</span></div>
          <button
            onClick={() => user
              ? setNegotiating({ asset: listing, scores: matchScores ?? { semantic_score: 0, price_score: 0, distance_score: 0, final_score: 0 } })
              : nav('/login')}
            className="mt-4 w-full bg-navy text-espresso py-2.5 rounded-xl font-semibold text-sm hover:bg-navy-light transition-colors"
          >
            Negotiate & Book
          </button>
        </div>
      </main>
      <Footer />

      <AnimatePresence>
        {negotiating && <NegotiatePage item={negotiating} onClose={() => setNegotiating(null)} />}
      </AnimatePresence>
    </div>
  )
}
