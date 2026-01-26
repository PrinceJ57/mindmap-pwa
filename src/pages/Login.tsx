// src/pages/Login.tsx
import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Login() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function signInWithGoogle() {
    try {
      setError(null)
      setLoading(true)

      // Prefer a stable production URL so preview deploys don’t redirect back to dead URLs.
      const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined) || window.location.origin

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${SITE_URL}/capture`,
        },
      })

      if (error) setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="stack">
      <div className="stack-sm">
        <h2>Login</h2>
        <p className="muted">Sign in with Google.</p>
      </div>

      <button
        onClick={signInWithGoogle}
        disabled={loading}
        className="button button--primary"
        style={{ width: '100%' }}
      >
        {loading ? 'Opening Google…' : 'Continue with Google'}
      </button>

      {error && <p style={{ color: '#f87171' }}>{error}</p>}
    </div>
  )
}
