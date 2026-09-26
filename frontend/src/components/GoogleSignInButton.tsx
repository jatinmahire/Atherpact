/**
 * AetherPact — "Continue with Google" button (Firebase Auth, Addendum 4).
 * Shared by Login and Register: signInWithPopup creates the account on
 * first use or logs in on subsequent ones — Firebase treats both the same.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithPopup } from 'firebase/auth'
import { Loader2 } from 'lucide-react'
import { auth, googleProvider } from '../lib/firebase'

export default function GoogleSignInButton() {
  const nav = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleClick = async () => {
    setError('')
    setLoading(true)
    try {
      await signInWithPopup(auth, googleProvider)
      nav('/')
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        setError('Google sign-in failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="w-full border border-gray-200 text-gray-700 py-2.5 rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.1 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.4 19 12 24 12c3.1 0 5.9 1.1 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.4 0 10.3-2.1 13.9-5.5l-6.4-5.4C29.5 34.7 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4 5.6l6.4 5.4C41.5 35.7 44 30.4 44 24c0-1.3-.1-2.3-.4-3.5z"/>
          </svg>
        )}
        Continue with Google
      </button>
      {error && <p className="text-xs text-red-600 mt-2 text-center">{error}</p>}
    </div>
  )
}
