/**
 * AetherPact — "Continue with Google" button (Firebase Auth, Addendum 4).
 * Shared by Login and Register: signInWithPopup creates the account on
 * first use or logs in on subsequent ones — Firebase treats both the same.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithPopup, getAdditionalUserInfo } from 'firebase/auth'
import { Loader2 } from 'lucide-react'
import { auth, googleProvider } from '../lib/firebase'
import { authAPI } from '../api/client'
import { authStore } from '../store/auth'

export default function GoogleSignInButton() {
  const nav = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // First-time Google sign-up: Firebase has no PROVIDER/SEEKER/BOTH concept,
  // so a brand-new account needs one real question before it's usable.
  const [needsRole, setNeedsRole] = useState(false)
  const [pendingName, setPendingName] = useState('')
  const [savingRole, setSavingRole] = useState(false)
  const [contactPhone, setContactPhone] = useState('')

  const handleClick = async () => {
    setError('')
    setLoading(true)
    try {
      const cred = await signInWithPopup(auth, googleProvider)
      const info = getAdditionalUserInfo(cred)
      if (info?.isNewUser) {
        setPendingName(cred.user.displayName || 'New User')
        setNeedsRole(true)
      } else {
        // Existing user: don't just navigate and hope the ambient
        // onAuthStateChanged listener's /auth/me round trip lands in time —
        // fetch and set the store directly so the UI flips immediately, and
        // so a failure here is visible instead of leaving Navbar stuck on
        // "Sign in" with a fully successful Firebase login.
        try {
          const res = await authAPI.me()
          authStore.setUser(res.data)
          nav('/')
        } catch (err) {
          console.error('GoogleSignInButton: signed into Firebase but /auth/me failed', err)
          setError('Signed in, but could not reach the server. Please try again.')
        }
      }
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        setError('Google sign-in failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const chooseRole = async (role: string) => {
    // Phase 85: required at every registration path, not just the plain
    // email/password form — Google sign-up would otherwise skip it entirely.
    if (!/^\+?[\d\s\-()]{7,15}$/.test(contactPhone.trim())) {
      setError('Enter a valid phone number (7-15 digits, optional +country code)')
      return
    }
    setError('')
    setSavingRole(true)
    try {
      const res = await authAPI.register(pendingName, role, contactPhone.trim())
      authStore.setUser(res.data)
      nav('/')
    } catch {
      setError('Could not save your role — please try again.')
    } finally {
      setSavingRole(false)
    }
  }

  if (needsRole) {
    return (
      <div className="border border-lavender/30 rounded-xl p-4 bg-lavender/5">
        <p className="text-sm font-medium text-gray-800 mb-3">Welcome, {pendingName}!</p>
        <input
          type="tel"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-3 focus:outline-none focus:border-navy"
          placeholder="Contact phone, e.g. +91 98765 43210"
        />
        <p className="text-sm font-medium text-gray-800 mb-2">Are you a…</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: 'seeker', label: 'Seeker' },
            { value: 'provider', label: 'Provider' },
            { value: 'both', label: 'Both' },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={savingRole}
              onClick={() => chooseRole(opt.value)}
              className="border border-gray-200 rounded-xl py-2 text-sm font-medium text-gray-700 hover:bg-white hover:border-navy transition-colors disabled:opacity-50"
            >
              {opt.label}
            </button>
          ))}
        </div>
        {error && <p className="text-xs text-red-600 mt-2 text-center">{error}</p>}
      </div>
    )
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
