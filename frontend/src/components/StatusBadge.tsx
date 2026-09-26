const STYLES: Record<string, string> = {
  confirmed: 'bg-green-100 text-green-700',
  active: 'bg-green-100 text-green-700',
  clear: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  review_needed: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-red-100 text-red-700',
  failed: 'bg-red-100 text-red-700',
  no_deal: 'bg-gray-100 text-gray-600',
  inactive: 'bg-gray-100 text-gray-600',
}

const LABELS: Record<string, string> = {
  review_needed: 'Review Needed',
  no_deal: 'No Deal',
}

/** Never conveys status by color alone — always paired with the real label text. */
export default function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase()
  const style = STYLES[key] ?? 'bg-gray-100 text-gray-600'
  const label = LABELS[key] ?? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ')
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${style}`}>{label}</span>
  )
}
