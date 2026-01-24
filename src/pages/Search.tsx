import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

type NodeRow = {
  id: number
  type: string
  title: string
  body: string
  status: string
  created_at: string
}

export default function Search() {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<NodeRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true

    async function run() {
      setLoading(true)
      // Simple search: title/body ilike
      // (Later: swap to full-text search via RPC or `search` column)
      const query = supabase
        .from('nodes')
        .select('id,type,title,body,status,created_at')
        .order('created_at', { ascending: false })
        .limit(50)

      const { data, error } = q.trim()
        ? await query.or(`title.ilike.%${q}%,body.ilike.%${q}%`)
        : await query

      if (!active) return
      setLoading(false)
      if (error) alert(error.message)
      else setRows(data ?? [])
    }

    run()
    return () => { active = false }
  }, [q])

  return (
    <div>
      <h2>Search</h2>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search title/body…"
        style={{ width: '100%', padding: 12, fontSize: 16, marginBottom: 12 }}
      />

      {loading && <p>Searching…</p>}

      <div style={{ display: 'grid', gap: 10 }}>
        {rows.map(r => (
          <div key={r.id} style={{ border: '1px solid #333', borderRadius: 10, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <strong>{r.title}</strong>
              <span style={{ opacity: 0.8 }}>{r.type}</span>
            </div>
            {r.body && <p style={{ marginTop: 8, opacity: 0.9 }}>{r.body.slice(0, 180)}{r.body.length > 180 ? '…' : ''}</p>}
            <div style={{ marginTop: 8, opacity: 0.7, fontSize: 12 }}>
              {new Date(r.created_at).toLocaleString()} • {r.status}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
