import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import TagInput from '../components/TagInput'
import TagChips from '../components/TagChips'
import { STATUSES, type Status } from '../utils/status'

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
    <div className="stack">
      <h2>Board</h2>

      <div className="stack-sm">
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search title/body…"
          className="input"
        />

        <div className="row row--wrap">
          {(['all', 'idea', 'task'] as TypeFilter[]).map(option => (
            <button
              key={option}
              onClick={() => setTypeFilter(option)}
              disabled={typeFilter === option}
              className={`button ${typeFilter === option ? 'button--primary' : 'button--ghost'}`}
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
            className="button button--ghost"
            style={{ width: 'fit-content' }}
          >
            Clear filters
          </button>
        )}
      </div>

      {loading && <p>Loading board…</p>}
      {errorMessage && <p style={{ color: '#f87171' }}>{errorMessage}</p>}

      <div className="board">
        {STATUSES.map(status => {
          const items = grouped.get(status) ?? []
          const isOver = overStatus === status
          return (
            <div
              key={status}
              onDragOver={(event) => handleDragOver(event, status)}
              onDragLeave={() => handleDragLeave(status)}
              onDrop={(event) => handleDrop(event, status)}
              className={`column ${isOver ? 'column--over' : ''}`}
            >
              <div className="column__header">
                <strong style={{ textTransform: 'capitalize' }}>{status}</strong>
                <span className="muted" style={{ fontSize: 12 }}>{items.length}</span>
              </div>

              {items.length === 0 && (
                <div className="muted" style={{ fontSize: 12, padding: '6px 0' }}>
                  Drop here
                </div>
              )}

              {items.map(row => (
                <div
                  key={row.id}
                  draggable
                  onDragStart={(event) => handleDragStart(event, row)}
                  onDragEnd={handleDragEnd}
                  className={`cardItem ${draggedNodeId === row.id ? 'cardItem--dragging' : ''}`}
                >
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <Link to={`/node/${row.id}`}>
                      <strong style={{ fontSize: 14 }}>{row.title}</strong>
                    </Link>
                    <span className="muted" style={{ fontSize: 11 }}>{row.type}</span>
                  </div>
                  {row.body && (
                    <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>
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
