/**
 * AetherPact — Skeleton loading card.
 * Shown exactly while a real async request is in flight — removed when the response arrives.
 */

import { motion } from 'framer-motion'

function Pulse({ className }: { className: string }) {
  return (
    <motion.div
      className={`bg-gray-200 rounded ${className}`}
      animate={{ opacity: [0.4, 0.8, 0.4] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <div className="flex justify-between mb-3">
        <div className="flex-1">
          <Pulse className="h-3 w-16 mb-2" />
          <Pulse className="h-5 w-3/4 mb-2" />
          <Pulse className="h-3 w-1/2" />
        </div>
        <div className="text-right">
          <Pulse className="h-6 w-20 mb-1 ml-auto" />
          <Pulse className="h-3 w-12 ml-auto" />
        </div>
      </div>
      <Pulse className="h-3 w-full mb-1" />
      <Pulse className="h-3 w-4/5" />
    </div>
  )
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
