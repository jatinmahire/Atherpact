/**
 * AetherPact — Register page.
 */

import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { authAPI } from '../api/client'
import { authStore } from '../store/auth'
import GoogleSignInButton from '../components/GoogleSignInButton'

// Phase 37 (Addendum 4): Firebase's own error codes, translated into plain
// language — never expose "auth/email-already-in-use" directly.
function firebaseErrorMessage(err: any): string {
  const code = err?.code ?? ''
  if (code.includes('email-already-in-use')) return 'That email is already registered — try signing in instead.'
  if (code.includes('weak-password')) return 'Password must be at least 6 characters.'
  if (code.includes('invalid-email')) return 'Please enter a valid email address.'
  return 'Registration failed.'
}

export default function Register() {
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const [form, setForm] = useState({
    email: '', password: '', display_name: '', role: 'both',
    referral_code: searchParams.get('ref') ?? '',
  })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      // Firebase creates the real account; our backend only records the
      // application-level profile (display_name/role/referral) right after,
      // authenticated with the Firebase ID token this just produced.
      await createUserWithEmailAndPassword(auth, form.email, form.password)
      const res = await authAPI.register(form.display_name, form.role, form.referral_code.trim() || undefined)
      // authStore's own onAuthStateChanged listener also fires from the
      // signup above and calls GET /auth/me independently — that race can
      // land before this profile-sync finishes and cache the stale,
      // email-derived default display_name. Set the fresh result directly
      // rather than trusting whichever call happens to resolve last.
      authStore.setUser(res.data)
      nav('/')
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? firebaseErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-lavender/10 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-lg border border-lavender/20 p-6 w-full max-w-md"
      >
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-navy flex items-center justify-center">
            <span className="text-white text-sm font-bold">Æ</span>
          </div>
          <span className="font-bold text-navy text-xl">AetherPact</span>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">Create account</h1>
        <p className="text-gray-500 text-sm mb-6">Join the hospitality resource marketplace</p>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">{error}</div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input
              type="text"
              value={form.display_name}
              onChange={update('display_name')}
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-navy"
              placeholder="Grand Hotel Mumbai"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={update('email')}
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-navy"
              placeholder="you@hotel.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={update('password')}
              required
              minLength={6}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-navy"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">I am a…</label>
            <select
              value={form.role}
              onChange={update('role')}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-navy bg-white"
            >
              <option value="both">Both (list and search resources)</option>
              <option value="provider">Provider (list my resources)</option>
              <option value="seeker">Seeker (find resources to rent)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Referral Code <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              type="text"
              value={form.referral_code}
              onChange={update('referral_code')}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-navy uppercase"
              placeholder="e.g. 46D7B980"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-navy text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-navy-light transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            Create Account
          </button>
        </form>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <GoogleSignInButton />

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-navy font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
