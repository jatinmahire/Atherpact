/**
 * AetherPact — How It Works (Phase 21, Addendum 3 / reference image panel 11).
 * Animated 6-step journey + a worked example using real demo-data numbers
 * consistent with the rest of the app (Grand Banquet Hall, ₹ pricing shown
 * elsewhere in seed data and test runs this session).
 */
import { motion } from 'framer-motion'
import { Search, Sparkles, Handshake, CalendarCheck, ShieldCheck, Star } from 'lucide-react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'

const STEPS = [
  { icon: Search, title: 'List or Search', desc: 'Providers list idle resources; seekers describe what they need in plain language.' },
  { icon: Sparkles, title: 'Get Matched', desc: 'Real semantic embeddings (all-MiniLM-L6-v2) rank listings — never keyword matching.' },
  { icon: Handshake, title: 'Negotiate', desc: 'A deterministic ZOPA solver computes a fair clearing price from pure arithmetic.' },
  { icon: CalendarCheck, title: 'Book', desc: 'Availability is checked and blocked atomically — no double bookings.' },
  { icon: ShieldCheck, title: 'Verify', desc: 'OpenCV compares check-in/check-out photos for real visual changes.' },
  { icon: Star, title: 'Rate & Grow', desc: 'Reviews feed a provider\'s real dashboard analytics — never fabricated numbers.' },
]

export default function HowItWorks() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-lavender/10">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 py-12">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
          <span className="text-xs font-semibold text-navy bg-lavender/40 px-3 py-1 rounded-full uppercase tracking-widest">How It Works</span>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mt-4">A simple, transparent process</h1>
          <p className="text-gray-500 mt-2 max-w-xl mx-auto">
            For businesses to find, negotiate, and book hospitality resources — every step backed
            by real logic, not a demo script.
          </p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-5 mb-16">
          {STEPS.map((s, i) => (
            <motion.div key={s.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="bg-white rounded-2xl border border-lavender/20 shadow-sm p-5">
              <div className="w-10 h-10 rounded-xl bg-lavender/20 flex items-center justify-center mb-3 text-navy font-bold text-sm">
                {i + 1}
              </div>
              <s.icon size={20} className="text-navy mb-2" />
              <h3 className="font-semibold text-gray-900 mb-1">{s.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
            </motion.div>
          ))}
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          className="bg-navy/5 rounded-2xl border border-navy/10 p-6">
          <h2 className="font-bold text-gray-900 mb-4">A worked example</h2>
          <div className="flex flex-wrap gap-2 text-sm text-gray-600 items-center">
            <span className="bg-white px-3 py-1.5 rounded-full border border-gray-200">Grand Banquet Hall listed at ₹85,000/day</span>
            <span>→</span>
            <span className="bg-white px-3 py-1.5 rounded-full border border-gray-200">Caterer searches "banquet hall for a wedding"</span>
            <span>→</span>
            <span className="bg-white px-3 py-1.5 rounded-full border border-gray-200">Real semantic match found</span>
            <span>→</span>
            <span className="bg-white px-3 py-1.5 rounded-full border border-gray-200">ZOPA settles at a real clearing price</span>
            <span>→</span>
            <span className="bg-white px-3 py-1.5 rounded-full border border-gray-200">Booking confirmed</span>
            <span>→</span>
            <span className="bg-white px-3 py-1.5 rounded-full border border-gray-200">Check-in / check-out verified</span>
            <span>→</span>
            <span className="bg-white px-3 py-1.5 rounded-full border border-gray-200">Review submitted</span>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            This is the same flow you can run yourself right now from Explore → Negotiate & Book → Visual Audit.
          </p>
        </motion.div>
      </main>
      <Footer />
    </div>
  )
}
