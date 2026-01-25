import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

type NodeRow = {
  id: number
  type: string
  title: string
  body: string | null
  status: string
  created_at: string
  tags?: string[] | null
}

type TypeFilter = 'all' | 'idea' | 'task'
type StatusFilter = 'all' | 'inbox' | 'active' | 'waiting' | 'someday' | 'done' | 'archived'

function normalizeTag(raw: string) {
  return raw.trim().toLowerCase()
}

export default function Search() {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<NodeRow[]>([])
  const [loading, setLoading] = useState(false)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [tagFilter, setTagFilter] = useState<string[]>([])

  async function hydrateTags(baseRows: NodeRow[]) {
    const nodeIds = baseRows.map(row => row.id)
    if (nodeIds.length === 0) return baseRows

    const { data, error } = await supabase
      .from('node_tags')
      .select('node_id, tags(name)')
      .in('node_id', nodeIds)

    if (error) {
      alert(error.message)
      return baseRows.map(row => ({ ...row, tags: [] }))
    }

    const tagMap = new Map<number, string[]>()
    for (const row of data ?? []) {
      const raw = (row as { tags?: { name?: string } | { name?: string }[] }).tags
      const names = Array.isArray(raw)
        ? raw.map(entry => entry?.name).filter(Boolean) as string[]
        : raw?.name
          ? [raw.name]
          : []
      if (!tagMap.has((row as { node_id: number }).node_id)) {
        tagMap.set((row as { node_id: number }).node_id, [])
      }
      tagMap.get((row as { node_id: number }).node_id)!.push(...names)
    }

    return baseRows.map(row => ({
      ...row,
      tags: tagMap.get(row.id) ?? [],
    }))
  }

  function addTagFilter(raw: string) {
    const tag = normalizeTag(raw)
    if (!tag) return
    setTagFilter(prev => (prev.includes(tag) ? prev : [...prev, tag]))
  }

  function removeTagFilter(tag: string) {
    setTagFilter(prev => prev.filter(t => t !== tag))
  }

  useEffect(() => {
    let active = true

    async function run() {
      setLoading(true)
      const { data, error } = await supabase.rpc('search_nodes', {
        q: q.trim(),
        lim: 50,
        type_filter: typeFilter === 'all' ? null : typeFilter,
        status_filter: statusFilter === 'all' ? null : statusFilter,
        tag_filter: tagFilter.length ? tagFilter : null,
      })

      if (!active) return
      if (error) {
        setLoading(false)
        alert(error.message)
        return
      }

      const baseRows = (data ?? []) as NodeRow[]
      const needsTagFetch = baseRows.some(row => !Array.isArray(row.tags))
      const rowsWithTags = needsTagFetch ? await hydrateTags(baseRows) : baseRows
      const normalized = rowsWithTags.map(row => ({
        ...row,
        tags: Array.isArray(row.tags) ? row.tags.map(normalizeTag) : [],
      }))
      setRows(normalized)
      setLoading(false)
    }

    run()
    return () => { active = false }
  }, [q, typeFilter, statusFilter, tagFilter])

  return (
    <div>
      <h2>Search</h2>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search title/body…"
        style={{ width: '100%', padding: 12, fontSize: 16, marginBottom: 12 }}
      />

      <div style={{ display: 'grid', gap: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['all', 'idea', 'task'] as TypeFilter[]).map(option => (
            <button
              key={option}
              onClick={() => setTypeFilter(option)}
              disabled={typeFilter === option}
            >
              {option === 'all' ? 'All' : option === 'idea' ? 'Ideas' : 'Tasks'}
            </button>
          ))}
        </div>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          style={{ width: '100%', padding: 12, fontSize: 16 }}
        >
          <option value="all">All statuses</option>
          <option value="inbox">inbox</option>
          <option value="active">active</option>
          <option value="waiting">waiting</option>
          <option value="someday">someday</option>
          <option value="done">done</option>
          <option value="archived">archived</option>
        </select>

        {(typeFilter !== 'all' || statusFilter !== 'all' || tagFilter.length > 0) && (
          <button
            type="button"
            onClick={() => {
              setTypeFilter('all')
              setStatusFilter('all')
              setTagFilter([])
            }}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #333',
              background: '#111',
              color: '#fff',
              fontSize: 12,
              cursor: 'pointer',
              width: 'fit-content',
            }}
          >
            Clear all filters
          </button>
        )}

        {tagFilter.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {tagFilter.map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() => removeTagFilter(tag)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  borderRadius: 999,
                  border: '1px solid #333',
                  background: '#111',
                  color: '#fff',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {tag} ×
              </button>
            ))}
            <button
              type="button"
              onClick={() => setTagFilter([])}
              style={{ border: 'none', background: 'transparent', color: '#aaa', fontSize: 12 }}
            >
              Clear tags
            </button>
          </div>
        )}
      </div>

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
            {r.tags && r.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {r.tags.map(tag => (
                  <button
                    key={`${r.id}-${tag}`}
                    type="button"
                    onClick={() => addTagFilter(tag)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 999,
                      border: '1px solid #333',
                      background: '#111',
                      color: '#fff',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
