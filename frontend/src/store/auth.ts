/**
 * AetherPact — Auth state store.
 * Phase 37 (Addendum 4): session state is now Firebase's own — this store
 * just mirrors it. `onAuthStateChanged` is Firebase's session-restore
 * mechanism (fires immediately with the current user on load, then again
 * on every sign-in/out), replacing the old localStorage JWT.
 */
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth'
import { auth } from '../lib/firebase'
import type { User } from '../api/client'
import { authAPI } from '../api/client'

let _firebaseUser: FirebaseUser | null = null
let _user: User | null = null
let _ready = false
let _listeners: Array<() => void> = []
// Guards against React StrictMode's dev-mode double effect invocation (and
// any other accidental repeat call) registering a second onAuthStateChanged
// listener — that used to fire two concurrent GET /auth/me calls for the
// same brand-new user, racing the backend's upsert.
let _restorePromise: Promise<void> | null = null

const notify = () => _listeners.forEach((fn) => fn())

export const authStore = {
  getUser: () => _user,
  isAuthenticated: () => _firebaseUser !== null,
  /** False until Firebase has reported the session at least once — a page
   * that guards a route must wait for this before redirecting to /login,
   * otherwise a real session looks logged-out for the brief moment before
   * Firebase's own restore finishes. */
  isReady: () => _ready,

  setUser(user: User | null) {
    _user = user
    notify()
  },

  async logout() {
    await signOut(auth)
  },

  subscribe(fn: () => void) {
    _listeners.push(fn)
    return () => { _listeners = _listeners.filter((l) => l !== fn) }
  },

  /** Called from App.tsx on mount. Resolves once Firebase has reported the
   * current session (signed in or not); keeps syncing on every subsequent
   * sign-in/out for the lifetime of the app. Idempotent — a repeat call
   * (StrictMode's double-invoke, or any other accidental re-entry) returns
   * the same in-flight/completed promise rather than registering a second
   * Firebase listener. */
  restoreSession(): Promise<void> {
    if (_restorePromise) return _restorePromise
    _restorePromise = new Promise((resolve) => {
      let first = true
      onAuthStateChanged(auth, async (fbUser) => {
        _firebaseUser = fbUser
        if (fbUser) {
          try {
            const res = await authAPI.me()
            _user = res.data
          } catch (err) {
            // Was a silent catch — a failed /auth/me (e.g. blocked as mixed
            // content, or a dead backend) left the UI stuck on "Sign in"
            // with a successful Firebase login and zero visible signal why.
            console.error('authStore: failed to fetch /auth/me after Firebase sign-in', err)
            _user = null
          }
        } else {
          _user = null
        }
        _ready = true
        notify()
        if (first) { first = false; resolve() }
      })
    })
    return _restorePromise
  },
}
