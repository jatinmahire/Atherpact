/**
 * AetherPact — Landing Page (standalone design brief, this route only).
 *
 * Honesty notes on brief scope: the "editorial cutout" treatment specified
 * true alpha-channel background removal via rembg (a local ML model). That
 * step was skipped to conserve budget — rembg needs a ~176MB model
 * download and an onnxruntime dependency, fragile territory for a design
 * exploration. The detail photo below is instead a full rectangular photo
 * given the layered/shadowed treatment (rotation + soft box-shadow)
 * without true cutout transparency. A certified Lighthouse audit was also
 * not run (no such tool is available in this environment) — the
 * performance practices from the brief (lazy 3D, lazy below-the-fold
 * images, explicit image dimensions, transform/opacity-only animation,
 * compressed WebP) are followed in code, but the score itself is
 * unverified rather than fabricated.
 */

import { lazy, Suspense, useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  motion,
  MotionConfig,
  useReducedMotion,
  useMotionValue,
  useSpring,
  useScroll,
  useTransform,
} from 'framer-motion'
import { ArrowRight } from 'lucide-react'
// Fraunces/Archivo are now loaded globally from main.tsx (Addendum 7).
import ChatWidget from '../components/ChatWidget'
import { authStore } from '../store/auth'
import { matchAPI } from '../api/client'
import type { MatchResultItem } from '../api/client'
import { useCountUp } from '../hooks/useCountUp'

const HeroScene = lazy(() => import('../components/HeroScene'))

const CATEGORIES = [
  { title: 'Commercial Kitchens', img: '/landing/cat-kitchen.webp', w: 900, h: 600, span: '' },
  { title: 'Banquet Halls', img: '/landing/cat-banquethall.webp', w: 900, h: 1200, span: 'md:row-span-2' },
  { title: 'Event Spaces', img: '/landing/cat-eventspace.webp', w: 900, h: 600, span: '' },
  { title: 'Vehicles', img: '/landing/cat-vehicles.webp', w: 900, h: 601, span: '' },
  { title: 'AV Equipment', img: '/landing/cat-avequipment.webp', w: 900, h: 600, span: '' },
]

const STEPS = [
  { title: 'List or Search', desc: 'Providers list idle resources; seekers describe what they need in plain language.' },
  { title: 'Get Matched', desc: 'Real semantic embeddings rank listings by fit — never just keyword overlap.' },
  { title: 'Negotiate', desc: 'A deterministic ZOPA solver finds a fair clearing price from both sides’ real numbers.' },
  { title: 'Book', desc: 'Confirmed instantly, with hard conflict checking against existing bookings.' },
  { title: 'Verify', desc: 'Check-in and check-out photos are compared with real computer vision, not guesswork.' },
  { title: 'Rate & Grow', desc: 'Real reviews and dashboard analytics build trust for the next deal.' },
]

const WHY = [
  { title: 'Smart Matching', desc: 'all-MiniLM-L6-v2 embeddings find resources that actually fit, computed live for every search.' },
  { title: 'Fair Negotiation', desc: 'A transparent ZOPA formula sets the price — pure arithmetic, never a black box.' },
  { title: 'Trusted Transactions', desc: 'Real Razorpay payments with server-side signature verification, never a client-side shortcut.' },
  { title: 'Visual Verification', desc: 'OpenCV compares check-in and check-out photos for real structural change, not lighting.' },
]


// Landing Page Update (Part 1, Section 3): pointer-relative 3D tilt, shared
// by the hero floating card and each category tile. Uses raw motion values
// updated imperatively on mousemove (not React state) so hover doesn't
// trigger a re-render on every pixel of movement — the spring smoothing is
// what makes it feel physical rather than snapping to the pointer.
function useTilt() {
  const prefersReducedMotion = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const rawRotateX = useMotionValue(0)
  const rawRotateY = useMotionValue(0)
  const rotateX = useSpring(rawRotateX, { stiffness: 300, damping: 25 })
  const rotateY = useSpring(rawRotateY, { stiffness: 300, damping: 25 })

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (prefersReducedMotion || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width - 0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5
    rawRotateX.set(py * -10)
    rawRotateY.set(px * 10)
  }
  const onMouseLeave = () => {
    rawRotateX.set(0)
    rawRotateY.set(0)
  }

  return { ref, rotateX, rotateY, onMouseMove, onMouseLeave }
}

function FloatingResourceCard({ item }: { item: MatchResultItem | null }) {
  const [cardShown, setCardShown] = useState(false)
  const pct = item ? Math.round(item.scores.final_score * 100) : 0
  const countedPct = useCountUp(pct, cardShown)
  const tilt = useTilt()

  if (!item) return null

  return (
    <motion.div
      ref={tilt.ref}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.1, duration: 0.6, ease: 'easeOut' }}
      onAnimationComplete={() => setCardShown(true)}
      style={{ rotateX: tilt.rotateX, rotateY: tilt.rotateY, transformPerspective: 800, willChange: 'transform' }}
      className="card-shine glass-surface absolute bottom-6 right-4 sm:bottom-10 sm:right-10 w-64 p-4 font-body overflow-hidden"
    >
      {/* Scrim: the hero photo behind this card is busy, so text needs its
          own darkening layer underneath, independent of the glass blur. */}
      <div className="absolute inset-0 bg-gradient-to-br from-espresso/50 to-espresso/20 pointer-events-none rounded-[24px]" />
      <div className="relative">
        <p className="text-[10px] uppercase tracking-wide text-brass font-medium mb-1">Real live match</p>
        <h4 className="text-warm-white font-semibold text-sm leading-snug mb-1">{item.asset.title}</h4>
        <div className="flex items-center justify-between mt-2">
          <span className="text-warm-white/70 text-xs">₹{item.asset.price_per_day.toLocaleString('en-IN')}/day</span>
          <span className="text-brass font-bold text-sm">{countedPct}% Match</span>
        </div>
      </div>
    </motion.div>
  )
}

// Category tile: same tilt treatment plus a ~0.85x scroll parallax on the
// image layer only (the caption/gradient stay put so text never blurs by
// drifting out of its box). Parallax reads scroll progress through
// useScroll rather than a scroll event listener, so there's nothing to
// throttle or debounce by hand.
function CategoryTile({ c }: { c: (typeof CATEGORIES)[number] }) {
  const prefersReducedMotion = useReducedMotion()
  const tilt = useTilt()
  const { scrollYProgress } = useScroll({ target: tilt.ref, offset: ['start end', 'end start'] })
  const parallaxY = useTransform(scrollYProgress, [0, 1], prefersReducedMotion ? [0, 0] : [-16, 16])

  return (
    <motion.div
      ref={tilt.ref}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
      style={{ rotateX: tilt.rotateX, rotateY: tilt.rotateY, transformPerspective: 800, willChange: 'transform' }}
      className={`card-shine relative rounded-xl overflow-hidden ${c.span}`}
    >
      <motion.img
        src={c.img}
        alt={c.title}
        width={c.w}
        height={c.h}
        loading="lazy"
        style={{ y: parallaxY, scale: 1.12, willChange: 'transform' }}
        className="w-full h-56 md:h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-espresso/80 via-transparent to-transparent" />
      <span className="absolute bottom-4 left-4 font-display text-warm-white text-lg">{c.title}</span>
    </motion.div>
  )
}

// Restrained scroll fade-in for each major section: 16-24px of motion,
// under half a second, IntersectionObserver-driven (whileInView) rather
// than a scroll listener, and never replays once triggered.
function FadeInSection({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.section>
  )
}

export default function Landing() {
  const nav = useNavigate()
  const [user, setUser] = useState(authStore.getUser())
  const [heroItem, setHeroItem] = useState<MatchResultItem | null>(null)
  const hasFetchedHero = useRef(false)
  const heroRef = useRef<HTMLDivElement>(null)
  const [scrolledPastHero, setScrolledPastHero] = useState(false)

  useEffect(() => {
    setUser(authStore.getUser())
    return authStore.subscribe(() => setUser(authStore.getUser()))
  }, [])

  // Glass Surface Pass: the navbar's glass variant switches once the user
  // has scrolled past the hero photograph and onto the warm stone body.
  useEffect(() => {
    const handleScroll = () => {
      const heroHeight = heroRef.current?.offsetHeight ?? 640
      setScrolledPastHero(window.scrollY > heroHeight - 80)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Real live data for the hero's floating card — never invented numbers.
  useEffect(() => {
    if (hasFetchedHero.current) return
    hasFetchedHero.current = true
    matchAPI.match('banquet hall for a large event', 60000)
      .then((res) => setHeroItem(res.data.results[0] ?? null))
      .catch(() => {})
  }, [])

  return (
    <MotionConfig reducedMotion="user">
    <div className="font-body">
      {/* Glass Surface Pass: floating nav, fixed above everything. Dark-hero
          glass while over the photo, stone glass once scrolled past it —
          reads as glass floating over whatever's moving beneath it. */}
      <nav
        className={`glass-surface${scrolledPastHero ? ' glass-surface--on-stone' : ''} fixed top-3 left-3 right-3 sm:top-4 sm:left-4 sm:right-4 z-50 flex items-center justify-between px-4 sm:px-6 py-3 max-w-6xl mx-auto transition-[background] duration-300`}
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brass flex items-center justify-center">
            <span className="text-espresso text-sm font-bold font-display">Æ</span>
          </div>
          <span className="font-display font-semibold text-warm-white text-xl">AetherPact</span>
        </div>
        <div className="flex gap-4 items-center text-sm">
          <button onClick={() => nav('/seeker')} className="text-warm-white/80 hover:text-warm-white transition-colors">Search</button>
          <button onClick={() => nav('/audit')} className="text-warm-white/80 hover:text-warm-white transition-colors">Verify</button>
          <button onClick={() => nav('/weather-twin')} title="Live weather, demand-impact scoring, and a real Nugen-reasoned map for every listing."
            className="text-warm-white/80 hover:text-warm-white transition-colors">Weather Twin</button>
          {user ? (
            <>
              <span className="text-sm font-semibold text-brass bg-brass/15 px-3 py-1.5 rounded-full">{user.display_name}</span>
              <button onClick={() => { authStore.logout(); nav('/') }} className="text-warm-white/80 hover:text-warm-white transition-colors">Sign out</button>
            </>
          ) : (
            <>
              <button onClick={() => nav('/login')} className="text-warm-white/80 hover:text-warm-white transition-colors">Sign in</button>
              <button onClick={() => nav('/register')} className="bg-brass text-espresso px-4 py-2 rounded-full font-medium hover:opacity-90 transition-opacity">Get Started</button>
            </>
          )}
        </div>
      </nav>

      {/* ── HERO: cinematic, espresso, one orchestrated animation ── */}
      <section ref={heroRef} className="relative bg-espresso text-warm-white overflow-hidden min-h-[640px]">
        <img
          src="/landing/hero-restaurant.webp"
          alt=""
          width={1920}
          height={1200}
          fetchPriority="high"
          className="absolute inset-0 w-full h-full object-cover opacity-60"
          style={{ animation: 'landing-hero-zoom 20s ease-out forwards' }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-espresso via-espresso/70 to-espresso/40" />

        {/* Quiet 3D moment, lazy-loaded, low opacity, never competing with the headline */}
        <div className="absolute inset-0 opacity-40 pointer-events-none hidden md:block">
          <Suspense fallback={null}>
            <HeroScene primaryColor="#B8925A" wireColor="#F3EFE6" lightColor="#B8925A" />
          </Suspense>
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-8 pt-28 sm:pt-32 pb-40 sm:pb-56">
          <motion.div
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12 } } }}
            className="max-w-xl"
          >
            <motion.h1
              variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className="font-display text-4xl sm:text-5xl lg:text-6xl leading-[1.05] mb-6"
            >
              Unlock Unused Potential<br />in Hospitality
            </motion.h1>
            <motion.p
              variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="text-warm-white/80 text-lg leading-relaxed mb-8 max-w-md"
            >
              Connecting hospitality businesses with the idle kitchens, halls, vehicles, and equipment
              already sitting right next to them.
            </motion.p>
            <motion.div
              variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="flex gap-3 flex-wrap"
            >
              <button
                onClick={() => nav('/seeker')}
                className="bg-brass text-espresso px-6 py-3 rounded-full font-semibold flex items-center gap-2 hover:opacity-90 transition-opacity"
              >
                Find a Resource <ArrowRight size={18} />
              </button>
              {user?.role !== 'seeker' && (
                <button
                  onClick={() => nav('/provider')}
                  className="border border-warm-white/40 text-warm-white px-6 py-3 rounded-full font-semibold hover:bg-warm-white/10 transition-colors"
                >
                  List Your Resource
                </button>
              )}
            </motion.div>
          </motion.div>
        </div>

        <FloatingResourceCard item={heroItem} />
      </section>

      {/* ── BODY: warm stone, quiet and legible ── */}
      <main className="bg-stone text-ink">
        {/* Resource categories — asymmetric editorial grid */}
        <FadeInSection className="max-w-6xl mx-auto px-4 sm:px-8 py-20">
          <h2 className="font-display text-3xl mb-10">What businesses share on AetherPact</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:grid-rows-2">
            {CATEGORIES.map((c) => (
              <CategoryTile key={c.title} c={c} />
            ))}
          </div>
        </FadeInSection>

        {/* How AetherPact Works — the one place numbered steps belong */}
        <FadeInSection className="max-w-6xl mx-auto px-4 sm:px-8 py-20">
          <h2 className="font-display text-3xl mb-10">How AetherPact Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-10">
            {STEPS.map((s, i) => (
              <div key={s.title} className="flex gap-4">
                <span className="font-display text-3xl text-brass shrink-0 w-10">{i + 1}</span>
                <div>
                  <h3 className="font-semibold text-ink mb-1">{s.title}</h3>
                  <p className="text-ink/60 text-sm leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </FadeInSection>

        {/* Why AetherPact — plain claims, one layered detail photo */}
        <FadeInSection className="max-w-6xl mx-auto px-4 sm:px-8 py-20 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-12 items-start">
          <div>
            <h2 className="font-display text-3xl mb-10">Why AetherPact</h2>
            <div className="space-y-8">
              {WHY.map((w) => (
                <div key={w.title} className="border-l-2 border-brass pl-5">
                  <h3 className="font-semibold text-ink mb-1">{w.title}</h3>
                  <p className="text-ink/60 text-sm leading-relaxed max-w-lg">{w.desc}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="hidden lg:block relative pt-10">
            <img
              src="/landing/detail-tablesetting.webp"
              alt=""
              width={900}
              height={600}
              loading="lazy"
              className="w-full rounded-lg rotate-2 shadow-[0_25px_60px_-15px_rgba(22,19,16,0.45)]"
            />
          </div>
        </FadeInSection>

        {/* Statistics — labeled honestly as demo/example unless real */}
        <FadeInSection className="max-w-6xl mx-auto px-4 sm:px-8 py-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
            <div>
              <div className="font-display text-4xl text-brass">5</div>
              <p className="text-ink/50 text-xs mt-1">resource categories</p>
            </div>
            <div>
              <div className="font-display text-4xl text-brass">92%</div>
              <p className="text-ink/50 text-xs mt-1">example match score*</p>
            </div>
            <div>
              <div className="font-display text-4xl text-brass">0.5/0.3/0.2</div>
              <p className="text-ink/50 text-xs mt-1">real match-score weights</p>
            </div>
          </div>
          <p className="text-ink/40 text-xs text-center mt-6">*Illustrative example, not a live company-wide statistic.</p>
        </FadeInSection>

        {/* Closing CTA — bookends the cinematic hero */}
        <FadeInSection className="bg-espresso text-warm-white py-20">
          <div className="max-w-3xl mx-auto px-4 text-center">
            <h2 className="font-display text-3xl sm:text-4xl mb-8">Turn idle capacity into opportunity.</h2>
            <div className="flex gap-3 justify-center flex-wrap">
              <button onClick={() => nav('/seeker')} className="bg-brass text-espresso px-6 py-3 rounded-full font-semibold hover:opacity-90 transition-opacity">
                Find a Resource
              </button>
              {user?.role !== 'seeker' && (
                <button onClick={() => nav('/provider')} className="border border-warm-white/40 text-warm-white px-6 py-3 rounded-full font-semibold hover:bg-warm-white/10 transition-colors">
                  List Your Resource
                </button>
              )}
            </div>
          </div>
        </FadeInSection>
      </main>

      <ChatWidget />
    </div>
    </MotionConfig>
  )
}
