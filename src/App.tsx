import { useCallback, useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import type { Session } from '@supabase/supabase-js'
import Login from './pages/Login'
import Capture from './pages/Capture'
import Search from './pages/Search'
import Board from './pages/Board'
import Outline from './pages/Outline'
import NodeDetail from './pages/NodeDetail'
import Home from './pages/Home'
import Review from './pages/Review'
import Import from './pages/Import'
import { getQueueCount, onQueueUpdate, syncOfflineQueue } from './offlineQueue'
import { CAPTURE_PREFILL_STORAGE_KEY, parsePrefillParams } from './lib/queryPrefill'

export default function App() {
  const [loading, setLoading] = useState(true)
  const [signedIn, setSignedIn] = useState(false)
  const [queueCount, setQueueCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const syncingRef = useRef(false)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    supabase.auth.getSession().then((res: { data: { session: Session | null } }) => {
      setSignedIn(!!res.data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      setSignedIn(!!session)
      setLoading(false)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const update = () => setQueueCount(getQueueCount())
    update()
    return onQueueUpdate(update)
  }, [])

  useEffect(() => {
    if (location.pathname !== '/capture') return
    const prefill = parsePrefillParams(location.search)
    if (!prefill.hasPrefill) return
    window.sessionStorage.setItem(CAPTURE_PREFILL_STORAGE_KEY, location.search)
  }, [location.pathname, location.search])

  const runSync = useCallback(async () => {
    if (!signedIn) return
    if (syncingRef.current) return
    if (getQueueCount() === 0) return

    syncingRef.current = true
    setSyncing(true)
    try {
      await syncOfflineQueue({ supabase, maxItems: 3 })
    } finally {
      syncingRef.current = false
      setSyncing(false)
      setQueueCount(getQueueCount())
    }
  }, [signedIn])

  useEffect(() => {
    if (!signedIn) return
    void runSync()
    const interval = window.setInterval(() => {
      void runSync()
    }, 15000)
    return () => window.clearInterval(interval)
  }, [runSync, signedIn])

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>

  return (
    <div className="container">
      {signedIn && (
        <header className="nav">
          <div className="nav__inner">
            <NavLink to="/home" className={({ isActive }) => `nav__link ${isActive ? 'nav__link--active' : ''}`}>
              Home
            </NavLink>
            <NavLink to="/capture" className={({ isActive }) => `nav__link ${isActive ? 'nav__link--active' : ''}`}>
              Capture
            </NavLink>
            <NavLink to="/search" className={({ isActive }) => `nav__link ${isActive ? 'nav__link--active' : ''}`}>
              Search
            </NavLink>
            <NavLink to="/board" className={({ isActive }) => `nav__link ${isActive ? 'nav__link--active' : ''}`}>
              Board
            </NavLink>
            <NavLink to="/outline" className={({ isActive }) => `nav__link ${isActive ? 'nav__link--active' : ''}`}>
              Outline
            </NavLink>
            <NavLink to="/review" className={({ isActive }) => `nav__link ${isActive ? 'nav__link--active' : ''}`}>
              Review
            </NavLink>
            <NavLink to="/import" className={({ isActive }) => `nav__link ${isActive ? 'nav__link--active' : ''}`}>
              Import
            </NavLink>

            {queueCount > 0 && (
              <span aria-live="polite" className="badge">
                Queued: {queueCount}
              </span>
            )}

            <button
              onClick={() => void runSync()}
              disabled={syncing || queueCount === 0}
              className="button button--primary"
              style={{ marginLeft: 'auto' }}
            >
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
            <button onClick={signOut} className="button button--ghost">
              Sign out
            </button>
          </div>
        </header>
      )}

      <Routes>
        <Route path="/login" element={signedIn ? <Navigate to="/home" /> : <Login />} />
        <Route path="/home" element={signedIn ? <Home /> : <Navigate to="/login" />} />
        <Route path="/capture" element={signedIn ? <Capture /> : <Navigate to="/login" />} />
        <Route path="/search" element={signedIn ? <Search /> : <Navigate to="/login" />} />
        <Route path="/board" element={signedIn ? <Board /> : <Navigate to="/login" />} />
        <Route path="/outline" element={signedIn ? <Outline /> : <Navigate to="/login" />} />
        <Route path="/review" element={signedIn ? <Review /> : <Navigate to="/login" />} />
        <Route path="/import" element={signedIn ? <Import /> : <Navigate to="/login" />} />
        <Route path="/node/:id" element={signedIn ? <NodeDetail /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to={signedIn ? "/home" : "/login"} />} />
      </Routes>
    </div>
  )
}
