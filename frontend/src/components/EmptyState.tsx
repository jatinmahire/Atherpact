import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

interface Props {
  icon: ReactNode
  title: string
  suggestions?: string[]
  ctaLabel?: string
  onCta?: () => void
}

export default function EmptyState({ icon, title, suggestions, ctaLabel, onCta }: Props) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 text-gray-400">
      <div className="mx-auto mb-3 opacity-40 flex justify-center">{icon}</div>
      <p className="text-gray-500 font-medium">{title}</p>
      {suggestions && suggestions.length > 0 && (
        <ul className="text-xs text-gray-400 mt-2 space-y-0.5">
          {suggestions.map((s) => <li key={s}>{s}</li>)}
        </ul>
      )}
      {ctaLabel && onCta && (
        <button onClick={onCta}
          className="mt-4 text-sm bg-navy text-white px-4 py-2 rounded-full font-medium hover:bg-navy-light transition-colors">
          {ctaLabel}
        </button>
      )}
    </motion.div>
  )
}
