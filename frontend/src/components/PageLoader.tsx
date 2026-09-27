/**
 * AetherPact — route-level Suspense fallback. Shown only for the brief
 * moment a lazy-loaded page's chunk is downloading (usually well under a
 * second on a warm connection); kept minimal so it never reads as a
 * separate "loading screen" between pages.
 */
import { Loader2 } from 'lucide-react'

export default function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone">
      <Loader2 size={28} className="animate-spin text-brass" />
    </div>
  )
}
