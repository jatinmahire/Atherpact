import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface Props {
  label: string
  value: string | number
  icon: ReactNode
  delay?: number
}

/** Real-data-only stat tile — never render a value here that wasn't fetched. */
export default function StatCard({ label, value, icon, delay = 0 }: Props) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay }}
      className="bg-white rounded-2xl p-5 border border-lavender/20 shadow-sm flex items-center gap-3">
      {icon}
      <div>
        <div className="text-lg font-bold text-gray-900">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </motion.div>
  )
}
