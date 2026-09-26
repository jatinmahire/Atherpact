import { useEffect, useState } from 'react'

/** Counts up from 0 to `value` over `duration`ms once `start` becomes true.
 * Shared by the landing hero card, the negotiation settle reveal, and
 * dashboard StatCards (Addendum 7, Phase 52/53) — always tied to a real
 * value arriving, never a fixed timer. */
export function useCountUp(value: number, start: boolean, duration = 900) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    if (!start) return
    const startTime = performance.now()
    let raf: number
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration)
      setDisplay(Math.round(progress * value))
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, start, duration])
  return display
}
