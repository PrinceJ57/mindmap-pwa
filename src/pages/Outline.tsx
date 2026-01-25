import { useEffect, useMemo, useRef, useState } from 'react'
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

function normalizeTag(raw: string) {
  return raw.trim().toLowerCase()
}

function mergeTags(existing: string[] = [], incoming: string[]) {
  const set = new Set(existing.map(normalizeTag))
  for (const tag of incoming) set.add(normalizeTag(tag))
  return Array.from(set)
}

export default function Outline() {
  const [q, setQ] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [rows, setRows] = useState<NodeRow[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<Status | ''>('')
  const [bulkTags, setBulkTags] = useState<string[]>([])
  const [working, setWorking] = useState(false)
  const headerCheckboxRef = useRef<HTMLInputElement | null>(null)

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
      setSelectedIds(prev => {
        const next = new Set<number>()
        for (const row of normalized) {
          if (prev.has(row.id)) next.add(row.id)
        }
        return next
      })
      setLoading(false)
    }

    run()
    return () => { active = false }
  }, [q, typeFilter, tagFilter])

  const allSelected = rows.length > 0 && rows.every(row => selectedIds.has(row.id))
  const selectedCount = selectedIds.size

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = selectedCount > 0 && !allSelected
    }
  }, [selectedCount, allSelected])

  function toggleRow(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set())
      return
    }
    setSelectedIds(new Set(rows.map(row => row.id)))
  }

  function addTagFilter(raw: string) {
    const tag = normalizeTag(raw)
    if (!tag) return
    setTagFilter(prev => (prev.includes(tag) ? prev : [...prev, tag]))
  }

  async function updateStatuses(ids: number[], nextStatus: Status) {
    const chunkSize = 10
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize)
      const results = await Promise.all(
        chunk.map(id => supabase.rpc('set_node_status', { node_id: id, new_status: nextStatus }))
      )
      for (const result of results) {
        if (result.error) throw result.error
      }
    }
  }

  async function upsertTags(names: string[]) {
    const session = (await supabase.auth.getSession()).data.session
    if (!session) throw new Error('Not signed in.')

    const unique = Array.from(new Set(names.map(normalizeTag).filter(Boolean)))
    if (unique.length === 0) return new Map<string, number>()

    const { data, error } = await supabase
      .from('tags')
      .upsert(
        unique.map(name => ({ owner_id: session.user.id, name })),
        { onConflict: 'owner_id,name' }
      )
      .select('id,name')

    if (error) throw error

    const map = new Map<string, number>()
    for (const row of data ?? []) {
      const name = normalizeTag((row as { name: string }).name)
      const id = (row as { id: number }).id
      map.set(name, id)
    }
    return map
  }

  async function addTagsToNodes(nodeIds: number[], names: string[]) {
    const tagMap = await upsertTags(names)
    const tagIds = Array.from(tagMap.values())
    if (tagIds.length === 0) return

    const inserts: { node_id: number; tag_id: number }[] = []
    for (const nodeId of nodeIds) {
      for (const tagId of tagIds) {
        inserts.push({ node_id: nodeId, tag_id: tagId })
      }
    }

    const chunkSize = 500
    for (let i = 0; i < inserts.length; i += chunkSize) {
      const chunk = inserts.slice(i, i + chunkSize)
      const { error } = await supabase
        .from('node_tags')
        .upsert(chunk, { onConflict: 'node_id,tag_id' })

      if (error) throw error
    }
  }

  async function handleBulkStatus() {
    if (!bulkStatus || selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    const previous = rows
    setWorking(true)
    setRows(prev => prev.map(row => (selectedIds.has(row.id) ? { ...row, status: bulkStatus } : row)))

    try {
      await updateStatuses(ids, bulkStatus)
    } catch (error) {
      setRows(previous)
      alert((error as Error).message)
    } finally {
      setWorking(false)
      setBulkStatus('')
    }
  }

  async function handleBulkTags() {
    if (bulkTags.length === 0 || selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    const incoming = bulkTags.map(normalizeTag).filter(Boolean)
    if (incoming.length === 0) return

    setWorking(true)
    try {
      await addTagsToNodes(ids, incoming)
      setRows(prev => prev.map(row => (
        selectedIds.has(row.id)
          ? { ...row, tags: mergeTags(row.tags ?? [], incoming) }
          : row
      )))
      setBulkTags([])
    } catch (error) {
      alert((error as Error).message)
    } finally {
      setWorking(false)
    }
  }

  const hasFilters = q.trim() !== '' || typeFilter !== 'all' || tagFilter.length > 0

  const emptyState = !loading && rows.length === 0

  const rowsById = useMemo(() => new Set(rows.map(row => row.id)), [rows])

  useEffect(() => {
    setSelectedIds(prev => {
      const next = new Set<number>()
      for (const id of prev) {
        if (rowsById.has(id)) next.add(id)
      }
      return next
    })
  }, [rowsById])

  return (
    <div>
      <h2>Outline</h2>

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

      {selectedCount > 0 && (
        <div
          style={{
            border: '1px solid #333',
            borderRadius: 12,
            padding: 12,
            marginBottom: 16,
            display: 'grid',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>{selectedCount} selected</strong>
            {working && <span style={{ fontSize: 12, opacity: 0.7 }}>Working…</span>}
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <label style={{ fontSize: 12, opacity: 0.7 }}>Bulk set status</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select
                value={bulkStatus}
                onChange={(event) => setBulkStatus(event.target.value as Status | '')}
                style={{ padding: 10, fontSize: 14 }}
              >
                <option value="">Select status</option>
                {STATUSES.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleBulkStatus}
                disabled={!bulkStatus || working}
              >
                Apply
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <label style={{ fontSize: 12, opacity: 0.7 }}>Bulk add tags</label>
            <TagInput value={bulkTags} onChange={setBulkTags} placeholder="Add tags" />
            <button
              type="button"
              onClick={handleBulkTags}
              disabled={bulkTags.length === 0 || working}
              style={{ width: 'fit-content' }}
            >
              Add tags
            </button>
          </div>
        </div>
      )}

      {loading && <p>Loading outline…</p>}
      {errorMessage && <p style={{ color: '#ff8080' }}>{errorMessage}</p>}

      {emptyState && <p>No results.</p>}

      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 720, display: 'grid', gap: 8 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '36px 1.6fr 90px 110px 1fr',
              gap: 12,
              padding: '8px 4px',
              borderBottom: '1px solid #333',
              fontSize: 12,
              opacity: 0.8,
            }}
          >
            <input
              ref={headerCheckboxRef}
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              aria-label="Select all"
            />
            <span>Title</span>
            <span>Type</span>
            <span>Status</span>
            <span>Tags</span>
          </div>

          {rows.map(row => (
            <div
              key={row.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '36px 1.6fr 90px 110px 1fr',
                gap: 12,
                padding: '10px 4px',
                borderBottom: '1px solid #222',
                alignItems: 'center',
              }}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(row.id)}
                onChange={() => toggleRow(row.id)}
                aria-label={`Select ${row.title}`}
              />
              <div style={{ display: 'grid', gap: 4 }}>
                <strong style={{ fontSize: 14 }}>{row.title}</strong>
                {row.body && (
                  <span style={{ fontSize: 12, opacity: 0.7 }}>
                    {row.body.slice(0, 120)}{row.body.length > 120 ? '…' : ''}
                  </span>
                )}
                <span style={{ fontSize: 11, opacity: 0.6 }}>
                  {new Date(row.created_at).toLocaleDateString()}
                </span>
              </div>
              <span style={{ fontSize: 12 }}>{row.type}</span>
              <span style={{ fontSize: 12 }}>{row.status}</span>
              <TagChips tags={row.tags ?? []} onTagClick={addTagFilter} compact />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
