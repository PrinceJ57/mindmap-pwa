import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import type { Session } from '@supabase/supabase-js'
import Login from './pages/Login'
import Capture from './pages/Capture'
import Search from './pages/Search'
import Board from './pages/Board'
import Outline from './pages/Outline'

export default function App() {
  const [loading, setLoading] = useState(true)
  const [signedIn, setSignedIn] = useState(false)
  const navigate = useNavigate()

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

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
      {signedIn && (
        <header style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
          <Link to="/capture">Capture</Link>
          <Link to="/search">Search</Link>
          <Link to="/board">Board</Link>
          <Link to="/outline">Outline</Link>
          <button onClick={signOut} style={{ marginLeft: 'auto' }}>Sign out</button>
        </header>
      )}

      <Routes>
        <Route path="/login" element={signedIn ? <Navigate to="/capture" /> : <Login />} />
        <Route path="/capture" element={signedIn ? <Capture /> : <Navigate to="/login" />} />
        <Route path="/search" element={signedIn ? <Search /> : <Navigate to="/login" />} />
        <Route path="/board" element={signedIn ? <Board /> : <Navigate to="/login" />} />
        <Route path="/outline" element={signedIn ? <Outline /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to={signedIn ? "/capture" : "/login"} />} />
      </Routes>
    </div>
  )
}





