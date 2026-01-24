import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendLink() {
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + '/capture',
      },
    })
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <div>
      <h2>Login</h2>
      <p>Magic link to your email.</p>

      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        style={{ width: '100%', padding: 12, fontSize: 16 }}
      />

      <button onClick={sendLink} style={{ width: '100%', padding: 12, marginTop: 12 }}>
        Send magic link
      </button>

      {sent && <p style={{ marginTop: 12 }}>Check your email and open the link.</p>}
      {error && <p style={{ color: 'crimson', marginTop: 12 }}>{error}</p>}
    </div>
  )
}
