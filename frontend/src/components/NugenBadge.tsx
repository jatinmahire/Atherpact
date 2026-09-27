/**
 * AetherPact — Addendum 9: shared badge for the two Nugen domain-aligned
 * advisory panels (negotiation insight, listing compliance review).
 * Reuses the existing sparkle-icon pattern from the smart-suggestion note.
 */
import { useState } from 'react'
import { Sparkles, Info } from 'lucide-react'

interface Props {
  focus: string // condensed one-line description of this agent's real domain focus
  className?: string
}

export default function NugenBadge({ focus, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <div className={className}>
      <div className="inline-flex items-center gap-1 text-[11px] text-gray-400">
        <Sparkles size={11} className="text-sage" />
        <span>Powered by Nugen Domain-Aligned AI</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="hover:text-navy transition-colors"
          aria-label="About this domain model"
        >
          <Info size={11} />
        </button>
      </div>
      {open && <p className="mt-1 text-[11px] text-gray-400">{focus}</p>}
    </div>
  )
}
