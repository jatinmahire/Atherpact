/**
 * AetherPact — App router with AnimatePresence page transitions.
 */

import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { authStore } from './store/auth'

import Landing        from './pages/Landing'
import Login          from './pages/Login'
import Register       from './pages/Register'
import ProviderPortal from './pages/ProviderPortal'
import SeekerPortal   from './pages/SeekerPortal'
import AuditPage      from './pages/AuditPage'
import HowItWorks     from './pages/HowItWorks'
import About          from './pages/About'
import Contact        from './pages/Contact'
import ListingDetail  from './pages/ListingDetail'

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
        </Routes>
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
      <AnimatedRoutes />
    </BrowserRouter>
  )
}
