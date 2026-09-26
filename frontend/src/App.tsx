/**
 * AetherPact — App router with AnimatePresence page transitions.
 */

import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { authStore } from './store/auth'

import Landing        from './pages/Landing'
import Login          from './pages/Login'
import Register       from './pages/Register'
import ProviderPortal from './pages/ProviderPortal'
import SeekerPortal   from './pages/SeekerPortal'
import AuditPage      from './pages/AuditPage'

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/"          element={<Landing />} />
        <Route path="/login"     element={<Login />} />
        <Route path="/register"  element={<Register />} />
        <Route path="/provider"  element={<ProviderPortal />} />
        <Route path="/seeker"    element={<SeekerPortal />} />
        <Route path="/audit"     element={<AuditPage />} />
      </Routes>
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
