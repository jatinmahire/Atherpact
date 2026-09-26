/**
 * AetherPact — About page (Phase 21, Addendum 3 / reference image panel 10).
 */
import { motion } from 'framer-motion'
import { Target, Eye, Heart } from 'lucide-react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'

export default function About() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-lavender/10">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-12">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <span className="text-xs font-semibold text-navy bg-lavender/40 px-3 py-1 rounded-full uppercase tracking-widest">About AetherPact</span>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mt-4 mb-4">
            Unlocking hidden capacity in the hospitality industry
          </h1>
          <p className="text-gray-600 leading-relaxed mb-3">
            Hotels, restaurants, and event venues routinely have valuable resources — commercial
            kitchens, banquet halls, AV equipment, vehicles — sitting idle for hours or days at a
            time. Meanwhile, other hospitality businesses need exactly that kind of resource, but
            only temporarily.
          </p>
          <p className="text-gray-600 leading-relaxed mb-10">
            AetherPact connects the two sides directly: real semantic matching to find the right
            fit, a transparent deterministic pricing engine to reach a fair rate, and visual
            verification to keep both parties honest about the resource's condition before and
            after use.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            { icon: Target, title: 'Our Mission', text: 'Maximize the use of idle hospitality resources.' },
            { icon: Eye, title: 'Our Vision', text: 'A more connected, sustainable hospitality ecosystem.' },
            { icon: Heart, title: 'Our Values', text: 'Trust, transparency, innovation, and mutual growth.' },
          ].map((v, i) => (
            <motion.div key={v.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-white rounded-2xl border border-lavender/20 shadow-sm p-6">
              <v.icon size={22} className="text-navy mb-3" />
              <h3 className="font-semibold text-gray-900 mb-1">{v.title}</h3>
              <p className="text-gray-500 text-sm">{v.text}</p>
            </motion.div>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  )
}
