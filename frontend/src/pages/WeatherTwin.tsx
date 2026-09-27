/**
 * AetherPact — Addendum 10: Weather Digital Twin (Phases 68-72).
 * Real live weather (Open-Meteo) + real demand-impact scoring + a real
 * Nugen domain-reasoning response, plotted on a real Leaflet/OpenStreetMap
 * map. The three scenario buttons are a labeled what-if simulation — they
 * only change the numbers this page computes and displays; they never
 * write to the database or touch any real booking/listing record.
 */

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Cloud, CloudRain, Sun, Loader2 } from 'lucide-react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import NugenBadge from '../components/NugenBadge'
import { weatherTwinAPI } from '../api/client'
import type { WeatherScenario, WeatherTwinListing } from '../api/client'
import { simulationStore } from '../store/simulation'

const SCENARIOS: { key: WeatherScenario; label: string; icon: typeof Cloud }[] = [
  { key: 'normal', label: 'Normal', icon: Cloud },
  { key: 'heavy_rain', label: 'Heavy Rain', icon: CloudRain },
  { key: 'heat_wave', label: 'Heat Wave', icon: Sun },
]

const DEFAULT_CENTER: [number, number] = [19.0760, 72.8777] // Mumbai — used only until real listings load

// demand_impact sign convention (per the real scoring formula): positive =
// demand likely drops (bad for the provider), negative = demand likely
// gains (e.g. indoor venues during bad weather). Red = high positive
// (urgent), green = negative/low. Clamped to the formula's realistic range.
function impactColor(impact: number): string {
  const clamped = Math.max(-30, Math.min(90, impact))
  const t = (clamped + 30) / 120 // 0..1
  const hue = 120 - t * 120 // 120 (green) -> 0 (red)
  return `hsl(${hue}, 70%, 45%)`
}

function popupHtml(item: WeatherTwinListing): string {
  const w = item.weather
  const reasoning = item.reasoning
    ? `<p style="margin:6px 0 0;font-size:12px;color:#374151;">${item.reasoning}</p>
       <p style="margin:4px 0 0;font-size:11px;color:#9ca3af;">✦ Powered by Nugen Domain-Aligned AI</p>`
    : `<p style="margin:6px 0 0;font-size:11px;color:#9ca3af;">Domain insight temporarily unavailable.</p>`
  return `
    <div style="min-width:220px;font-family:inherit;">
      <div style="font-weight:600;font-size:13px;margin-bottom:2px;">${item.title}</div>
      <div style="font-size:11px;color:#6b7280;margin-bottom:6px;">${item.category.replace('_', ' ')}</div>
      <div style="font-size:12px;color:#374151;">
        ${w.precip_prob.toFixed(0)}% rain · ${w.wind_kmh.toFixed(0)} km/h wind · ${w.temp_c.toFixed(0)}°C
      </div>
      <div style="font-size:12px;margin-top:4px;">
        Severity <b>${item.severity}</b> · Demand impact
        <b style="color:${impactColor(item.demand_impact)}">${item.demand_impact > 0 ? '+' : ''}${item.demand_impact}%</b>
      </div>
      ${reasoning}
    </div>
  `
}

export default function WeatherTwin() {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.CircleMarker[]>([])
  // Addendum 10, Phase 73: this page's own preset buttons now drive the
  // GLOBAL simulation store, not just a local variable — `scenario` here
  // is a local mirror of that store so React re-renders when it changes,
  // including when it's changed from somewhere else (e.g. "Return to
  // Live" in the persistent banner on another page).
  const [scenario, setScenario] = useState<WeatherScenario>(simulationStore.getMode() ?? 'normal')
  const [listings, setListings] = useState<WeatherTwinListing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => simulationStore.subscribe(() => setScenario(simulationStore.getMode() ?? 'normal')), [])

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

  // Fetch real (or preset) weather-twin data whenever the scenario changes
  useEffect(() => {
    setLoading(true)
    setError(false)
    weatherTwinAPI.snapshot(scenario)
      .then((res) => setListings(res.data.listings))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [scenario])

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
        color: '#ffffff',
        weight: 2,
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

  return (
    <div className="min-h-screen bg-stone">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-10">
        <h1 className="font-display text-3xl mb-1">Weather Digital Twin</h1>
        <p className="text-ink/60 text-sm mb-6">
          Real live weather, a transparent demand-impact score per resource type, and a real
          Nugen domain-reasoning response for every active listing — plotted on a live map.
        </p>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {SCENARIOS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => simulationStore.setMode(key === 'normal' ? null : key)}
              className={`inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-full font-medium transition-colors ${
                scenario === key ? 'bg-navy text-espresso' : 'bg-white text-gray-600 border border-gray-200 hover:border-navy/40'
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
          {scenario !== 'normal' && (
            <span className="text-xs text-gray-400 ml-1">
              Simulation only — using fixed, realistic weather values, not live data. No real booking or listing data is affected.
            </span>
          )}
          {loading && <Loader2 size={16} className="animate-spin text-gray-400 ml-1" />}
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">
            Couldn't load the weather twin snapshot. The backend may be unreachable — try again shortly.
          </div>
        )}

        <div ref={mapRef} className="w-full rounded-2xl overflow-hidden border border-gray-200" style={{ height: 500 }} />

        <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-gray-400">
            Marker color: green = demand likely gains (e.g. indoor venues in bad weather), red = demand likely drops.
          </p>
          <NugenBadge focus="Domain-aligned reasoning over live weather and real social signals for hospitality demand impact in India." />
        </div>
      </main>
      <Footer />
    </div>
  )
}
