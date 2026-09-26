/**
 * AetherPact — Shared navbar (Phase 20, Addendum 3).
 * Auth-aware: shows Sign in/Get Started when logged out, Dashboard/avatar/Sign out
 * when logged in. Used by the new pages built in this addendum; existing pages
 * (Landing, SeekerPortal, ProviderPortal, AuditPage) keep their own inline nav
 * per "don't rewrite working code" — this is for pages built fresh from here on.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { authStore } from '../store/auth'
import SystemStatus from './SystemStatus'

const LINKS = [
  { label: 'Home', path: '/' },
  { label: 'Explore', path: '/explore' },
  { label: 'How It Works', path: '/how-it-works' },
  { label: 'About', path: '/about' },
]

export default function Navbar() {
  const nav = useNavigate()
  const [user, setUser] = useState(authStore.getUser())

  useEffect(() => {
    // Re-sync immediately — the store can change in the gap between this
    // component's initial render and this effect subscribing (e.g. a
    // just-completed sign-in), which subscribe() alone would miss forever.
    setUser(authStore.getUser())
    return authStore.subscribe(() => setUser(authStore.getUser()))
  }, [])

  return (
    <nav className="flex items-center justify-between px-4 py-4 max-w-6xl mx-auto border-b border-lavender/20 bg-white/80 backdrop-blur sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => nav('/')}>
          <div className="w-8 h-8 rounded-lg bg-navy flex items-center justify-center">
            <span className="text-white text-sm font-bold">Æ</span>
          </div>
          <span className="font-bold text-navy text-xl">AetherPact</span>
        </div>
        <span className="hidden lg:block pl-2 border-l border-gray-200"><SystemStatus /></span>
      </div>

      <div className="hidden md:flex gap-6">
        {LINKS.map((l) => (
          <button key={l.path} onClick={() => nav(l.path)}
            className="text-sm text-gray-600 font-medium hover:text-navy transition-colors">
            {l.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        {user ? (
          <>
            <button onClick={() => nav(user.role === 'provider' ? '/provider' : '/explore')}
              className="text-sm text-navy font-medium hover:underline">Dashboard</button>
            <div className="w-8 h-8 rounded-full bg-lavender/40 flex items-center justify-center text-xs font-bold text-navy">
              {user.display_name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <button onClick={() => { authStore.logout(); nav('/') }}
              className="text-sm text-gray-500 hover:text-navy transition-colors">Sign out</button>
          </>
        ) : (
          <>
            <button onClick={() => nav('/login')} className="text-sm text-navy font-medium hover:underline">Sign in</button>
            <button onClick={() => nav('/register')}
              className="text-sm bg-navy text-espresso px-4 py-2 rounded-full font-medium hover:bg-navy-light transition-colors">
              List a Resource
            </button>
          </>
        )}
      </div>
    </nav>
  )
}
