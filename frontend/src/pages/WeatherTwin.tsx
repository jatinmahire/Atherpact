/**
 * AetherPact — Addendum 10: Weather Digital Twin.
 * Phases 68-72 (real live weather, real demand-impact scoring, real Nugen
 * reasoning, a live Leaflet map, a labeled what-if simulation), extended by
 * Phases 91-96: two real signal sources with clickable evidence, a real
 * numeric severity bump from combined signal volume, continuous
 * severity/duration/location simulation controls, a duration multiplier,
 * a live-vs-simulated delta panel, and a propagation summary line derived
 * from that same delta data. The simulation never writes to the database
 * or touches any real booking/listing record — only the numbers this page
 * computes and displays change.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Cloud, CloudRain, Sun, Loader2, Info } from 'lucide-react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import NugenBadge from '../components/NugenBadge'
import { weatherTwinAPI } from '../api/client'
import type { WeatherTwinListing, WeatherType } from '../api/client'
import { simulationStore } from '../store/simulation'

const DEFAULT_CENTER: [number, number] = [19.0760, 72.8777] // Mumbai — used only until real listings load

const DURATION_OPTIONS = [
  { hours: 1, label: '1 hour' },
  { hours: 24, label: '1 day' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '1 week' },
]

// Matches backend SENSITIVITY signs exactly (weather_twin_service.py) —
// used only to label the propagation summary/delta panel, never to
// recompute a score client-side.
const POSITIVE_SENSITIVITY_TYPES = new Set(['rooftop', 'kitchen', 'vehicle', 'av_equipment'])
const NEGATIVE_SENSITIVITY_TYPES = new Set(['banquet_hall'])
const DELIVERABLE_TYPES = new Set(['vehicle', 'av_equipment'])

// demand_impact sign convention: positive = demand likely drops (bad for
// the provider), negative = demand likely gains (e.g. indoor venues in bad
// weather). Red = high positive (urgent), green = negative/low.
function impactColor(impact: number): string {
  const clamped = Math.max(-30, Math.min(90, impact))
  const t = (clamped + 30) / 120
  const hue = 120 - t * 120
  return `hsl(${hue}, 70%, 45%)`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function popupHtml(item: WeatherTwinListing): string {
  const w = item.weather
  const s = item.social_signal
  const excerpts = [
    ...s.mastodon_excerpts.map((e) => ({ text: e.text || '', url: e.url, source: 'Mastodon' })),
    ...s.gdelt_excerpts.map((e) => ({ text: e.title || '', url: e.url, source: 'GDELT news' })),
  ].slice(0, 2)

  // Phase 91: real evidence — counts + clickable excerpts — shown ABOVE
  // Agent 3's paraphrased reasoning, not instead of it.
  const evidenceHtml = s.combined_count > 0
    ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #e5e7eb;">
         <div style="font-size:11px;color:#374151;font-weight:600;">${s.mastodon_count} posts, ${s.gdelt_count} news items found</div>
         ${excerpts.map((e) => `
           <div style="margin:3px 0;font-size:11px;">
             <a href="${e.url}" target="_blank" rel="noopener" style="color:#2563eb;text-decoration:underline;">${escapeHtml(e.text.slice(0, 90))}${e.text.length > 90 ? '…' : ''}</a>
             <span style="color:#9ca3af;"> — ${e.source}</span>
           </div>`).join('')}
       </div>`
    : `<div style="margin-top:6px;font-size:11px;color:#9ca3af;">No real social/news signal found for this city.</div>`

  // Phase 92: the numeric severity bump, disclosed with real before/after.
  const bumpHtml = item.signal_bump_applied
    ? `<div style="font-size:11px;color:#b45309;margin-top:4px;">Severity adjusted for real-world signal volume: ${item.severity_base} → ${item.severity}</div>`
    : ''

  const durationHtml = item.is_simulated && item.duration_multiplier !== 1.0
    ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;">Duration multiplier ×${item.duration_multiplier} applied</div>`
    : ''

  const reasoningHtml = item.reasoning
    ? `<p style="margin:6px 0 0;font-size:12px;color:#374151;">${item.reasoning}</p>
       <p style="margin:4px 0 0;font-size:11px;color:#9ca3af;display:flex;align-items:center;gap:4px;">
         <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
         Powered by Nugen Domain-Aligned AI
       </p>`
    : `<p style="margin:6px 0 0;font-size:11px;color:#9ca3af;">Domain insight temporarily unavailable.</p>`

  return `
    <div style="min-width:240px;font-family:inherit;">
      <div style="font-weight:600;font-size:13px;margin-bottom:2px;">${item.title}</div>
      <div style="font-size:11px;color:#6b7280;margin-bottom:6px;">${item.category.replace('_', ' ')}${item.is_simulated ? ' · simulated' : ' · live'}</div>
      <div style="font-size:12px;color:#374151;">
        ${w.precip_prob.toFixed(0)}% rain · ${w.wind_kmh.toFixed(0)} km/h wind · ${w.temp_c.toFixed(0)}°C
      </div>
      <div style="font-size:12px;margin-top:4px;">
        Severity <b>${item.severity}</b> · Demand impact
        <b style="color:${impactColor(item.demand_impact)}">${item.demand_impact > 0 ? '+' : ''}${item.demand_impact}%</b>
      </div>
      ${bumpHtml}
      ${durationHtml}
      ${evidenceHtml}
      ${reasoningHtml}
    </div>
  `
}

export default function WeatherTwin() {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.CircleMarker[]>([])

  // Phase 93: continuous inputs replace the old 3 fixed preset buttons.
  const [active, setActive] = useState(false) // false = Normal (real live everywhere)
  const [weatherType, setWeatherType] = useState<WeatherType>('rain')
  const [intensity, setIntensity] = useState(90)
  const [durationHours, setDurationHours] = useState(24)
  const [locationScope, setLocationScope] = useState<string>('') // '' = everywhere

  const [listings, setListings] = useState<WeatherTwinListing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const setQuickPreset = (preset: 'normal' | 'heavy_rain' | 'heat_wave') => {
    if (preset === 'normal') {
      setActive(false)
      simulationStore.setMode(null)
    } else if (preset === 'heavy_rain') {
      setActive(true); setWeatherType('rain'); setIntensity(90)
      simulationStore.setMode('heavy_rain')
    } else {
      setActive(true); setWeatherType('heat'); setIntensity(75)
      simulationStore.setMode('heat_wave')
    }
  }

  // Map init — once
  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return
    const map = L.map(mapRef.current).setView(DEFAULT_CENTER, 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)
    leafletMapRef.current = map
    return () => {
      map.remove()
      leafletMapRef.current = null
    }
  }, [])

  // Fetch real (or parametrized what-if) weather-twin data whenever any
  // control changes.
  useEffect(() => {
    setLoading(true)
    setError(false)
    weatherTwinAPI.snapshot(
      active
        ? { scenario: 'custom', weather_type: weatherType, intensity, duration_hours: durationHours, location_scope: locationScope || undefined }
        : { scenario: 'normal' },
    )
      .then((res) => setListings(res.data.listings))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [active, weatherType, intensity, durationHours, locationScope])

  // Redraw markers whenever listings change
  useEffect(() => {
    const map = leafletMapRef.current
    if (!map) return

    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    if (listings.length === 0) return

    listings.forEach((item) => {
      const marker = L.circleMarker([item.lat, item.lon], {
        radius: 11,
        color: item.is_simulated ? '#B8925A' : '#ffffff',
        weight: item.is_simulated ? 3 : 2,
        fillColor: impactColor(item.demand_impact),
        fillOpacity: 0.9,
      })
        .addTo(map)
        .bindPopup(popupHtml(item))
      markersRef.current.push(marker)
    })

    const bounds = L.latLngBounds(listings.map((i) => [i.lat, i.lon] as [number, number]))
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
  }, [listings])

  // The listing payload doesn't carry the extracted city string itself
  // (only lat/lon/address), so location-scope options reuse the same
  // known-city list the backend's own _extract_city() recognizes.
  const KNOWN_CITIES = ['Mumbai', 'Delhi', 'Bengaluru', 'Chennai', 'Kolkata', 'Hyderabad', 'Pune', 'Ahmedabad', 'Nagpur']

  // Phase 95: live-vs-simulated delta, for every listing currently in the
  // simulation's scope.
  const deltas = useMemo(
    () => listings
      .filter((l) => l.is_simulated && l.live_demand_impact != null)
      .map((l) => ({
        title: l.title,
        resource_type: l.resource_type,
        live: l.live_demand_impact as number,
        sim: l.demand_impact,
        delta: Math.round((l.demand_impact - (l.live_demand_impact as number)) * 10) / 10,
      })),
    [listings],
  )

  // Phase 96: propagation summary, built directly from the Phase 95 deltas
  // above — same counts, never a separate approximation.
  const propagationSummary = useMemo(() => {
    if (deltas.length === 0) return null
    const reduced = deltas.filter((d) => POSITIVE_SENSITIVITY_TYPES.has(d.resource_type) && d.delta > 5).length
    const substitution = deltas.filter((d) => NEGATIVE_SENSITIVITY_TYPES.has(d.resource_type) && d.delta < -5).length
    const deliveryRisk = listings.filter((l) => l.is_simulated && DELIVERABLE_TYPES.has(l.resource_type) && l.severity >= 0.5).length
    const parts: string[] = []
    if (reduced > 0) parts.push(`${reduced} outdoor listing${reduced !== 1 ? 's' : ''} show${reduced === 1 ? 's' : ''} reduced demand`)
    if (substitution > 0) parts.push(`${substitution} indoor listing${substitution !== 1 ? 's' : ''} show${substitution === 1 ? 's' : ''} increased substitution demand`)
    if (deliveryRisk > 0) parts.push(`${deliveryRisk} deliverable-item listing${deliveryRisk !== 1 ? 's' : ''} show${deliveryRisk === 1 ? 's' : ''} elevated delivery risk`)
    return parts.length ? parts.join('; ') : 'No listings in scope cross a meaningful impact threshold yet.'
  }, [deltas, listings])

  return (
    <div className="min-h-screen bg-stone">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-10">
        <h1 className="font-display text-3xl mb-1">Weather Digital Twin</h1>
        <p className="text-ink/60 text-sm mb-6">
          Real live weather, two real signal sources, a transparent demand-impact score, and a real
          Nugen domain-reasoning response for every active listing — plotted on a live map.
        </p>

        {/* Quick-select shortcuts */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {[
            { key: 'normal' as const, label: 'Normal', icon: Cloud },
            { key: 'heavy_rain' as const, label: 'Heavy Rain', icon: CloudRain },
            { key: 'heat_wave' as const, label: 'Heat Wave', icon: Sun },
          ].map(({ key, label, icon: Icon }) => {
            const isActive = key === 'normal' ? !active : active && weatherType === (key === 'heavy_rain' ? 'rain' : 'heat')
            return (
              <button
                key={key}
                onClick={() => setQuickPreset(key)}
                className={`inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-full font-medium transition-colors ${
                  isActive ? 'bg-navy text-espresso' : 'bg-white text-gray-600 border border-gray-200 hover:border-navy/40'
                }`}
              >
                <Icon size={14} /> {label}
              </button>
            )
          })}
          {loading && <Loader2 size={16} className="animate-spin text-gray-400 ml-1" />}
        </div>

        {/* Phase 93: real severity/duration/location controls */}
        <div className={`bg-white border border-gray-200 rounded-2xl p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${active ? '' : 'opacity-50 pointer-events-none'}`}>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Weather type</label>
            <select value={weatherType} onChange={(e) => setWeatherType(e.target.value as WeatherType)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="rain">Rain intensity</option>
              <option value="heat">Heat level</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Intensity: {intensity.toFixed(0)}%</label>
            <input type="range" min={0} max={100} value={intensity}
              onChange={(e) => setIntensity(parseFloat(e.target.value))}
              className="w-full accent-navy mt-2.5" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Duration</label>
            <select value={durationHours} onChange={(e) => setDurationHours(parseFloat(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              {DURATION_OPTIONS.map((d) => <option key={d.hours} value={d.hours}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Location scope</label>
            <select value={locationScope} onChange={(e) => setLocationScope(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="">Everywhere</option>
              {KNOWN_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {active && (
          <div className="flex items-start gap-2 text-xs text-gray-400 mb-4 bg-gray-50 rounded-xl px-3 py-2">
            <Info size={13} className="shrink-0 mt-0.5" />
            <span>
              Simulation only — listings {locationScope ? `in ${locationScope}` : 'everywhere'} use these parametrized weather values instead of live data;
              every other listing keeps showing real live weather, untouched. Duration multiplier = 1.0 + 0.15 × min(days, 7) — 1 day ×1.15, 3 days ×1.45, 1 week ×2.05 (capped).
              No real booking or listing data is affected.
            </span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">
            Couldn't load the weather twin snapshot. The backend may be unreachable — try again shortly.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          <div ref={mapRef} className="w-full rounded-2xl overflow-hidden border border-gray-200" style={{ height: 500 }} />

          {/* Phase 95: before/after delta panel */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 overflow-y-auto" style={{ maxHeight: 500 }}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Live vs. Simulated</p>
            {deltas.length === 0 ? (
              <p className="text-sm text-gray-400">Turn on a simulation to see per-listing impact deltas here.</p>
            ) : (
              <div className="space-y-3">
                {deltas.map((d) => (
                  <div key={d.title} className="text-sm border-b border-gray-50 pb-2 last:border-0">
                    <div className="font-medium text-gray-800">{d.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {d.live > 0 ? '+' : ''}{d.live}% <span className="text-gray-300">→</span>{' '}
                      <b style={{ color: impactColor(d.sim) }}>{d.sim > 0 ? '+' : ''}{d.sim}%</b>{' '}
                      <span className={d.delta > 0 ? 'text-red-500' : d.delta < 0 ? 'text-green-600' : 'text-gray-400'}>
                        ({d.delta > 0 ? '+' : ''}{d.delta} pts)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Phase 96: propagation summary, built from the exact same deltas */}
        {propagationSummary && (
          <div className="mt-4 bg-navy/5 border border-navy/10 rounded-xl px-4 py-3 text-sm text-navy font-medium">
            {propagationSummary}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-gray-400">
            Marker color: green = demand likely gains, red = demand likely drops. Brass outline = simulated.
          </p>
          <NugenBadge focus="Domain-aligned reasoning over live weather and real social + news signals for hospitality demand impact in India." />
        </div>
      </main>
      <Footer />
    </div>
  )
}
