/**
 * AetherPact — Addendum 10, Phase 73: persistent global banner shown
 * anywhere in the app whenever Simulation Mode is active. Purely a
 * display toggle — never writes to the database, never affects any real
 * booking, listing, or price record.
 */
import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { simulationStore } from '../store/simulation'

const SCENARIO_LABELS: Record<string, string> = {
  heavy_rain: 'Heavy Rain',
  heat_wave: 'Heat Wave',
}

export default function SimulationBanner() {
  const [mode, setMode] = useState(simulationStore.getMode())
  useEffect(() => simulationStore.subscribe(() => setMode(simulationStore.getMode())), [])

  if (!mode) return null

  return (
    // sticky, not fixed: this must occupy real layout space so it pushes
    // every page's own nav down instead of overlapping and blocking clicks
    // on it (found live, during Phase 77 verification).
    <div className="sticky top-0 left-0 right-0 z-[200] bg-wine text-warm-white text-xs sm:text-sm px-4 py-2 flex items-center justify-center gap-3 shadow-md">
      <AlertTriangle size={14} className="shrink-0" />
      <span>
        <span className="font-semibold">Simulation Mode: {SCENARIO_LABELS[mode]}</span> — showing projected effects, not live data
      </span>
      <button
        onClick={() => simulationStore.setMode(null)}
        className="ml-2 underline font-medium hover:text-brass transition-colors shrink-0"
      >
        Return to Live
      </button>
    </div>
  )
}
