/**
 * AetherPact — App router with AnimatePresence page transitions.
 */

import { useEffect, useState, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { authStore } from './store/auth'
import SimulationBanner from './components/SimulationBanner'
import PageLoader from './components/PageLoader'

// Each route's own code (and whatever it imports — Leaflet, Razorpay, the
// 3D hero) only downloads when that route is actually visited, instead of
// every page's code shipping in one bundle before the first paint.
const Landing        = lazy(() => import('./pages/Landing'))
const Login          = lazy(() => import('./pages/Login'))
const Register       = lazy(() => import('./pages/Register'))
const ProviderPortal = lazy(() => import('./pages/ProviderPortal'))
const SeekerPortal   = lazy(() => import('./pages/SeekerPortal'))
const AuditPage      = lazy(() => import('./pages/AuditPage'))
const HowItWorks     = lazy(() => import('./pages/HowItWorks'))
const About          = lazy(() => import('./pages/About'))
const Contact        = lazy(() => import('./pages/Contact'))
const ListingDetail  = lazy(() => import('./pages/ListingDetail'))
const WeatherTwin    = lazy(() => import('./pages/WeatherTwin'))

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      {/* Addendum 7, Phase 53: one consistent cross-fade between every
          route. AnimatePresence only animates a direct motion child's
          exit — previously it wrapped plain <Routes>, so no page here
          ever actually had an exit transition despite the comment above. */}
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
      >
        <Suspense fallback={<PageLoader />}>
          <Routes location={location}>
            <Route path="/"             element={<Landing />} />
            <Route path="/login"        element={<Login />} />
            <Route path="/register"     element={<Register />} />
            <Route path="/provider"     element={<ProviderPortal />} />
            {/* /explore is the addendum's canonical route; /seeker kept as an
                alias so existing links/buttons built earlier don't break. */}
            <Route path="/explore"      element={<SeekerPortal />} />
            <Route path="/seeker"       element={<SeekerPortal />} />
            <Route path="/listing/:id"  element={<ListingDetail />} />
            <Route path="/audit"        element={<AuditPage />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/about"        element={<About />} />
            <Route path="/contact"      element={<Contact />} />
            <Route path="/weather-twin" element={<WeatherTwin />} />
          </Routes>
        </Suspense>
      </motion.div>
    </AnimatePresence>
  )
}

export default function App() {
  const [, forceUpdate] = useState(0)

  // Restore JWT session on page load
  useEffect(() => {
    authStore.restoreSession().then(() => forceUpdate((n) => n + 1))
    return authStore.subscribe(() => forceUpdate((n) => n + 1))
  }, [])

  return (
    <BrowserRouter>
      {/* Addendum 10, Phase 73: persistent across every route, never
          re-mounted by page-transition animations. */}
      <SimulationBanner />
      <AnimatedRoutes />
    </BrowserRouter>
  )
}
