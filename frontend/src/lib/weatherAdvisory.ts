/**
 * AetherPact — Addendum 10, Phase 75: derives a real advisory tag directly
 * from the same Phase 69 severity/demand_impact values the backend already
 * computed (live or simulated) — no invented flavor text beyond the
 * minimal wording needed to make those real numbers readable.
 */
import type { WeatherTwinListing } from '../api/client'

const FACTOR_LABELS: Record<string, string> = {
  rain: 'Heavy rain',
  wind: 'High wind',
  heat: 'Extreme heat',
}

const ADVISORY_THRESHOLD = 15 // percentage points of demand_impact

export function deriveAdvisoryTag(listing: WeatherTwinListing | undefined): string | null {
  if (!listing || listing.dominant_factor === 'none') return null
  const { demand_impact: impact, dominant_factor } = listing
  const label = FACTOR_LABELS[dominant_factor]
  if (impact >= ADVISORY_THRESHOLD) {
    return `${label} expected — outdoor demand typically drops (${impact}%)`
  }
  if (impact <= -ADVISORY_THRESHOLD) {
    return `${label} expected — indoor demand typically gains (${Math.abs(impact)}%)`
  }
  return null
}
