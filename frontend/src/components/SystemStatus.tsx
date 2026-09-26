/**
 * AetherPact — honest offline-first status indicator.
 * Pings the real GET /health endpoint (no mocked "always online" state).
 */
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { systemAPI } from '../api/client'

export default function SystemStatus() {
  const [online, setOnline] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    const check = () => {
      systemAPI.health()
        .then(() => !cancelled && setOnline(true))
        .catch(() => !cancelled && setOnline(false))
    }
    check()
    const interval = setInterval(check, 15000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-400" title="AetherPact runs fully locally — this checks the local backend only">
      <motion.span
        className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-green-500' : online === false ? 'bg-red-400' : 'bg-gray-300'}`}
        animate={online ? { opacity: [1, 0.4, 1] } : {}}
        transition={{ duration: 2, repeat: Infinity }}
      />
      <span className="hidden sm:inline">
        Local Engine {online === null ? '· checking…' : online ? '· Online' : '· Unreachable'}
      </span>
    </div>
  )
}
