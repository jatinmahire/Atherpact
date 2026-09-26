import { AlertCircle, RotateCw } from 'lucide-react'

interface Props {
  message?: string
  onRetry?: () => void
}

/** Shown when a real request actually failed (backend unreachable, 5xx, etc) — never a generic catch-all masking a real bug. */
export default function ErrorState({ message = 'Unable to connect to AetherPact services.', onRetry }: Props) {
  return (
    <div className="text-center py-16">
      <AlertCircle size={36} className="mx-auto mb-3 text-red-300" />
      <p className="text-gray-600 font-medium">{message}</p>
      {onRetry && (
        <button onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 text-sm bg-white border border-gray-200 px-4 py-2 rounded-full font-medium hover:border-navy hover:text-navy transition-colors">
          <RotateCw size={14} /> Retry
        </button>
      )}
    </div>
  )
}
