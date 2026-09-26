/**
 * AetherPact — Landing Page.
 * Hero with React Three Fiber 3D element, honest AI description,
 * CTA buttons, and floating chat widget.
 */

import { lazy, Suspense, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Zap, Shield, BarChart3 } from 'lucide-react'
import ChatWidget from '../components/ChatWidget'
import SystemStatus from '../components/SystemStatus'
import { authStore } from '../store/auth'

// Lazy-load the 3D scene so the page hydrates instantly
const HeroScene = lazy(() => import('../components/HeroScene'))

const features = [
  {
    icon: <Zap size={22} className="text-navy" />,
    title: 'Semantic Matching',
    desc: 'all-MiniLM-L6-v2 embeddings find resources that actually match your need, not just keywords.',
  },
  {
    icon: <BarChart3 size={22} className="text-navy" />,
    title: 'Deterministic Pricing',
    desc: 'Our ZOPA solver computes a fair clearing price from pure arithmetic — no black-box AI decides the number.',
  },
  {
    icon: <Shield size={22} className="text-navy" />,
    title: 'Visual Change Detection',
    desc: 'OpenCV-based check-in / check-out comparison flags structural changes, not lighting artefacts.',
  },
]

export default function Landing() {
  const nav = useNavigate()
  const [user, setUser] = useState(authStore.getUser())

  useEffect(() => {
    return authStore.subscribe(() => setUser(authStore.getUser()))
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-lavender/10">
      {/* Nav */}
      <nav className="flex items-center justify-between px-4 py-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-navy flex items-center justify-center">
            <span className="text-white text-sm font-bold">Æ</span>
          </div>
          <span className="font-bold text-navy text-xl">AetherPact</span>
          <span className="hidden md:block ml-2 pl-2 border-l border-gray-200">
            <SystemStatus />
          </span>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => nav('/seeker')}
            className="text-sm text-navy font-medium hover:underline"
          >
            Search
          </button>
          <button
            onClick={() => nav('/audit')}
            className="text-sm text-navy font-medium hover:underline"
          >
            Verify
          </button>
          {user ? (
            <>
              <span className="text-sm text-gray-500">{user.display_name}</span>
              <button
                onClick={() => { authStore.logout(); nav('/') }}
                className="text-sm text-navy font-medium hover:underline"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => nav('/login')}
                className="text-sm text-navy font-medium hover:underline"
              >
                Sign in
              </button>
              <button
                onClick={() => nav('/register')}
                className="text-sm bg-navy text-white px-4 py-2 rounded-full font-medium hover:bg-navy-light transition-colors"
              >
                Get Started
              </button>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 py-12 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          <span className="inline-block text-xs font-semibold text-navy bg-lavender/40 px-3 py-1 rounded-full mb-4 uppercase tracking-widest">
            B2B Hospitality Marketplace
          </span>
          <h1 className="text-5xl font-bold text-gray-900 leading-tight mb-5">
            Idle resources,{' '}
            <span className="text-navy">matched intelligently.</span>
          </h1>
          <p className="text-gray-600 text-lg leading-relaxed mb-8">
            AetherPact uses real semantic embeddings to match hospitality businesses with idle
            kitchens, halls, AV gear, and vehicles — and a transparent ZOPA algorithm to negotiate
            fair prices. Everything runs locally, offline, on one machine.
          </p>
          <div className="flex gap-3 flex-wrap">
            <motion.button
              onClick={() => nav('/seeker')}
              className="bg-navy text-white px-6 py-3 rounded-full font-semibold flex items-center gap-2 hover:bg-navy-light transition-colors shadow-md"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              Browse Available Resources <ArrowRight size={18} />
            </motion.button>
            <motion.button
              onClick={() => nav('/provider')}
              className="border-2 border-navy text-navy px-6 py-3 rounded-full font-semibold hover:bg-navy/5 transition-colors"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              List Your Resource
            </motion.button>
          </div>
        </motion.div>

        {/* 3D Scene */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
          className="h-[360px] lg:h-[440px] relative"
        >
          <Suspense fallback={<div className="w-full h-full bg-lavender/10 rounded-3xl animate-pulse" />}>
            <HeroScene />
          </Suspense>
        </motion.div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              className="bg-white rounded-2xl p-6 shadow-sm border border-lavender/20 hover:shadow-md transition-shadow"
            >
              <div className="w-10 h-10 rounded-xl bg-lavender/20 flex items-center justify-center mb-4">
                {f.icon}
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <ChatWidget />
    </div>
  )
}
