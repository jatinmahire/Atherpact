/**
 * AetherPact — reusable Back button, themed for the current design system.
 * Not used by the landing page itself (a root page has nowhere to go
 * "back" to) — added now so pages built later have it ready.
 */
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

interface Props {
  to?: string      // navigate to a specific path instead of browser back
  label?: string
}

export default function BackButton({ to, label = 'Back' }: Props) {
  const nav = useNavigate()
  return (
    <button
      onClick={() => (to ? nav(to) : nav(-1))}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-navy hover:underline"
    >
      <ArrowLeft size={16} />
      {label}
    </button>
  )
}
