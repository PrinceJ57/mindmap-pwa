import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Login() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function signInWithGoogle() {
    try {
      setError(null)
      setLoading(true)

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/capture`,
        },
      })

      if (error) setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2>Login</h2>
      <p>Sign in with Google.</p>

      <button
        onClick={signInWithGoogle}
        disabled={loading}
        style={{ width: '100%', padding: 12, marginTop: 12, fontSize: 16 }}
      >
        {loading ? 'Opening Google…' : 'Continue with Google'}
      </button>

      {error && <p style={{ color: 'crimson', marginTop: 12 }}>{error}</p>}
    </div>
  )
}
