import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import TagInput from '../components/TagInput'
import TagChips from '../components/TagChips'

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

const STATUSES = ['inbox', 'active', 'waiting', 'someday', 'done', 'archived'] as const

type Status = typeof STATUSES[number]

type DragPayload = {
  id: number
  status: Status
}

function normalizeTag(raw: string) {
  return raw.trim().toLowerCase()
}

export default function Board() {
  const [q, setQ] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [rows, setRows] = useState<NodeRow[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [draggedNodeId, setDraggedNodeId] = useState<number | null>(null)
  const [draggedFromStatus, setDraggedFromStatus] = useState<Status | null>(null)
  const [overStatus, setOverStatus] = useState<Status | null>(null)

  useEffect(() => {
    let active = true

    async function run() {
      setLoading(true)
      setErrorMessage(null)

      const { data, error } = await supabase.rpc('list_nodes', {
        lim: 200,
        q: q.trim() ? q.trim() : null,
        type_filter: typeFilter === 'all' ? null : typeFilter,
        status_filter: null,
        tag_filter: tagFilter.length ? tagFilter : null,
      })

      if (!active) return

      if (error) {
        setErrorMessage(error.message)
        setRows([])
        setLoading(false)
        return
      }

      const normalized = ((data ?? []) as NodeRow[]).map(row => ({
        ...row,
        tags: Array.isArray(row.tags) ? row.tags.map(normalizeTag) : [],
      }))

      setRows(normalized)
      setLoading(false)
    }

    run()
    return () => { active = false }
  }, [q, typeFilter, tagFilter])

  const grouped = useMemo(() => {
    const map = new Map<Status, NodeRow[]>()
    for (const status of STATUSES) map.set(status, [])
    for (const row of rows) {
      if (STATUSES.includes(row.status as Status)) {
        map.get(row.status as Status)!.push(row)
      }
    }
    return map
  }, [rows])

  function addTagFilter(raw: string) {
    const tag = normalizeTag(raw)
    if (!tag) return
    setTagFilter(prev => (prev.includes(tag) ? prev : [...prev, tag]))
  }

  function handleDragStart(event: DragEvent<HTMLDivElement>, row: NodeRow) {
    const status = row.status as Status
    setDraggedNodeId(row.id)
    setDraggedFromStatus(status)
    event.dataTransfer.effectAllowed = 'move'
    const payload: DragPayload = { id: row.id, status }
    event.dataTransfer.setData('application/x-node', JSON.stringify(payload))
  }

  function handleDragEnd() {
    setDraggedNodeId(null)
    setDraggedFromStatus(null)
    setOverStatus(null)
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>, status: Status) {
    event.preventDefault()
    if (overStatus !== status) setOverStatus(status)
    event.dataTransfer.dropEffect = 'move'
  }

  function handleDragLeave(status: Status) {
    if (overStatus === status) setOverStatus(null)
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>, status: Status) {
    event.preventDefault()

    let payload: DragPayload | null = null
    const raw = event.dataTransfer.getData('application/x-node')
    if (raw) {
      try {
        payload = JSON.parse(raw) as DragPayload
      } catch {
        payload = null
      }
    }

    const nodeId = payload?.id ?? draggedNodeId
    if (!nodeId) return

    const currentRow = rows.find(row => row.id === nodeId)
    if (!currentRow) return

    const currentStatus = (payload?.status ?? draggedFromStatus ?? currentRow.status) as Status
    if (currentStatus === status) return

    setRows(prev => prev.map(row => (row.id === nodeId ? { ...row, status } : row)))
    setOverStatus(null)

    const { error } = await supabase.rpc('set_node_status', {
      node_id: nodeId,
      new_status: status,
    })

    if (error) {
      alert(error.message)
      setRows(prev => prev.map(row => (row.id === nodeId ? { ...row, status: currentStatus } : row)))
    }
  }

  const hasFilters = q.trim() !== '' || typeFilter !== 'all' || tagFilter.length > 0

  return (
    <div>
      <h2>Board</h2>

      <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search title/body…"
          style={{ width: '100%', padding: 12, fontSize: 16 }}
        />

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

        <TagInput value={tagFilter} onChange={setTagFilter} placeholder="Filter tags" />

        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setQ('')
              setTypeFilter('all')
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
            Clear filters
          </button>
        )}
      </div>

      {loading && <p>Loading board…</p>}
      {errorMessage && <p style={{ color: '#ff8080' }}>{errorMessage}</p>}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
        }}
      >
        {STATUSES.map(status => {
          const items = grouped.get(status) ?? []
          const isOver = overStatus === status
          return (
            <div
              key={status}
              onDragOver={(event) => handleDragOver(event, status)}
              onDragLeave={() => handleDragLeave(status)}
              onDrop={(event) => handleDrop(event, status)}
              style={{
                border: `1px solid ${isOver ? '#7aa2ff' : '#333'}`,
                borderRadius: 12,
                padding: 10,
                background: isOver ? 'rgba(122, 162, 255, 0.1)' : 'transparent',
                minHeight: 240,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ textTransform: 'capitalize' }}>{status}</strong>
                <span style={{ fontSize: 12, opacity: 0.7 }}>{items.length}</span>
              </div>

              {items.length === 0 && (
                <div style={{ fontSize: 12, opacity: 0.5, padding: '6px 0' }}>
                  Drop here
                </div>
              )}

              {items.map(row => (
                <div
                  key={row.id}
                  draggable
                  onDragStart={(event) => handleDragStart(event, row)}
                  onDragEnd={handleDragEnd}
                  style={{
                    border: '1px solid #333',
                    borderRadius: 10,
                    padding: 10,
                    background: '#0f0f0f',
                    cursor: 'grab',
                    opacity: draggedNodeId === row.id ? 0.6 : 1,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <Link to={`/node/${row.id}`} style={{ textDecoration: 'none', color: '#fff' }}>
                      <strong style={{ fontSize: 14 }}>{row.title}</strong>
                    </Link>
                    <span style={{ fontSize: 11, opacity: 0.7 }}>{row.type}</span>
                  </div>
                  {row.body && (
                    <p style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
                      {row.body.slice(0, 120)}{row.body.length > 120 ? '…' : ''}
                    </p>
                  )}
                  <div style={{ marginTop: 8 }}>
                    <TagChips tags={row.tags ?? []} onTagClick={addTagFilter} compact />
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
