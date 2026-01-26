import { useCallback, useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom'
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
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
      {signedIn && (
        <header
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            marginBottom: 16,
            flexWrap: 'wrap',
          }}
        >
          <Link to="/home">Home</Link>
          <Link to="/capture">Capture</Link>
          <Link to="/search">Search</Link>
          <Link to="/board">Board</Link>
          <Link to="/outline">Outline</Link>
          <Link to="/review">Review</Link>
          <Link to="/import">Import</Link>

          {queueCount > 0 && (
            <span
              aria-live="polite"
              style={{
                fontSize: 12,
                padding: '4px 8px',
                borderRadius: 999,
                background: '#f1f1f1',
              }}
            >
              Queued: {queueCount}
            </span>
          )}

          <button
            onClick={() => void runSync()}
            disabled={syncing || queueCount === 0}
            style={{ marginLeft: 'auto' }}
          >
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
          <button onClick={signOut}>Sign out</button>
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
