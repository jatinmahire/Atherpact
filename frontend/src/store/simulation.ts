/**
 * AetherPact — Addendum 10, Phase 73: global Simulation Mode.
 * Holds either null (live weather) or one of the real, existing Weather
 * Digital Twin presets ("heavy_rain" | "heat_wave"). Any part of the app
 * can read this to make weather-aware behavior reflect the active what-if
 * scenario instead of only live data. This is a pure client-side display
 * toggle — it is never written to the database and never affects any
 * real booking/listing/price record.
 */

export type SimulationMode = 'heavy_rain' | 'heat_wave' | null

// Phase 93: the twin-snapshot endpoint no longer takes these two fixed
// preset names directly — it takes a continuous (weather_type, intensity)
// pair instead. These are the exact same numbers the old presets used, so
// every existing consumer of the global mode (pricing, advisory tags, the
// banner) sees unchanged behavior.
export function modeToTwinParams(mode: SimulationMode): { scenario: 'normal' | 'custom'; weather_type?: 'rain' | 'heat'; intensity?: number } {
  if (mode === 'heavy_rain') return { scenario: 'custom', weather_type: 'rain', intensity: 90 }
  if (mode === 'heat_wave') return { scenario: 'custom', weather_type: 'heat', intensity: 75 }
  return { scenario: 'normal' }
}

let _mode: SimulationMode = null
const _listeners: Array<() => void> = []

function notify() {
  _listeners.forEach((fn) => fn())
}

export const simulationStore = {
  getMode(): SimulationMode {
    return _mode
  },
  setMode(mode: SimulationMode) {
    _mode = mode
    notify()
  },
  subscribe(fn: () => void) {
    _listeners.push(fn)
    return () => {
      const i = _listeners.indexOf(fn)
      if (i >= 0) _listeners.splice(i, 1)
    }
  },
}
