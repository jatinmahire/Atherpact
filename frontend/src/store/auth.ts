/**
 * AetherPact — Auth state store.
 * Simple module-level store: no Redux needed for a hackathon demo.
 * JWT is persisted in localStorage; user object is cached in memory.
 */

import type { User } from '../api/client'
import { authAPI } from '../api/client'

// Zustand would require another package — use a simple reactive store via custom hook + state
let _user: User | null = null
let _token: string | null = localStorage.getItem('aetherpact_token')
let _listeners: Array<() => void> = []

const notify = () => _listeners.forEach((fn) => fn())

export const authStore = {
  getUser: () => _user,
  getToken: () => _token,

  setToken(token: string) {
    _token = token
    localStorage.setItem('aetherpact_token', token)
    notify()
  },

  setUser(user: User | null) {
    _user = user
    notify()
  },

  logout() {
    _token = null
    _user = null
    localStorage.removeItem('aetherpact_token')
    notify()
  },

  subscribe(fn: () => void) {
    _listeners.push(fn)
    return () => { _listeners = _listeners.filter((l) => l !== fn) }
  },

  async restoreSession() {
    if (!_token) return
    try {
      const res = await authAPI.me()
      _user = res.data
      notify()
    } catch {
      // Token invalid or expired — clear it
      authStore.logout()
    }
  },
}
