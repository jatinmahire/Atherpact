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
