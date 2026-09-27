/**
 * AetherPact — Addendum 10, Phase 73: a brief toast shown whenever
 * Simulation Mode turns on or switches scenario. Purely a display toggle —
 * never writes to the database, never affects any real booking, listing,
 * or price record.
 */
import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { simulationStore } from '../store/simulation'

const SCENARIO_LABELS: Record<string, string> = {
  heavy_rain: 'Heavy Rain',
  heat_wave: 'Heat Wave',
}

const VISIBLE_MS = 3500

export default function SimulationBanner() {
  const [mode, setMode] = useState(simulationStore.getMode())
  const [visible, setVisible] = useState(false)

  useEffect(() => simulationStore.subscribe(() => setMode(simulationStore.getMode())), [])

  // Re-show the toast every time simulation mode turns on or the active
  // scenario changes, then auto-dismiss — it never lingers as a permanent bar.
  useEffect(() => {
    if (!mode) { setVisible(false); return }
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [mode])

  if (!mode || !visible) return null

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] bg-wine text-warm-white text-xs sm:text-sm px-4 py-2.5 rounded-full flex items-center gap-3 shadow-lg">
      <AlertTriangle size={14} className="shrink-0" />
      <span>
        <span className="font-semibold">Simulation Mode: {SCENARIO_LABELS[mode]}</span> — showing projected effects, not live data
      </span>
      <button
        onClick={() => simulationStore.setMode(null)}
        className="ml-1 underline font-medium hover:text-brass transition-colors shrink-0"
      >
        Return to Live
      </button>
    </div>
  )
}
