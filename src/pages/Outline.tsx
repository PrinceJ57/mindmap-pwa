import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import TagInput from '../components/TagInput'
import TagChips from '../components/TagChips'
import { STATUSES, type Status } from '../utils/status'
import {
  areFiltersEqual,
  filtersToSearchParams,
  normalizeViewFilters,
  parseFiltersFromSearchParams,
  type ViewFilters,
  type ViewSort,
} from '../utils/viewFilters'

type NodeRow = {
  id: number
  type: string
  title: string
  body: string | null
  status: string
  created_at: string
  updated_at?: string | null
  pinned?: boolean | null
  review_after?: string | null
  tags?: string[] | null
}

type TypeFilter = 'all' | 'idea' | 'task'

type SavedViewRow = {
  id: number
  name: string
  filters: ViewFilters
  created_at: string
  updated_at: string
}

function normalizeTag(raw: string) {
  return raw.trim().toLowerCase()
}

function mergeTags(existing: string[] = [], incoming: string[]) {
  const set = new Set(existing.map(normalizeTag))
  for (const tag of incoming) set.add(normalizeTag(tag))
  return Array.from(set)
}

function parseSavedViewFilters(raw: unknown): ViewFilters {
  if (!raw || typeof raw !== 'object') {
    return normalizeViewFilters({})
  }
  return normalizeViewFilters(raw as Partial<ViewFilters>)
}

function sortRows(rows: NodeRow[], sort: ViewSort) {
  if (sort === 'relevance') return rows
  const sorted = [...rows]
  sorted.sort((a, b) => {
    const aValue = sort === 'created'
      ? new Date(a.created_at).getTime()
      : new Date(a.updated_at ?? a.created_at).getTime()
    const bValue = sort === 'created'
      ? new Date(b.created_at).getTime()
      : new Date(b.updated_at ?? b.created_at).getTime()
    return bValue - aValue
  })
  return sorted
}

export default function Outline() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [filtersReady, setFiltersReady] = useState(false)

  const [q, setQ] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<Status[]>([])
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [sort, setSort] = useState<ViewSort>('updated')

  const [rows, setRows] = useState<NodeRow[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<Status | ''>('')
  const [bulkTags, setBulkTags] = useState<string[]>([])
  const [working, setWorking] = useState(false)
  const headerCheckboxRef = useRef<HTMLInputElement | null>(null)

  const [savedViews, setSavedViews] = useState<SavedViewRow[]>([])
  const [viewsLoading, setViewsLoading] = useState(false)
  const [selectedViewId, setSelectedViewId] = useState<number | null>(null)

  useEffect(() => {
    const parsed = parseFiltersFromSearchParams(searchParams)
    setQ(parsed.q ?? '')
    setTypeFilter(parsed.type ?? 'all')
    setStatusFilter(parsed.statuses ?? [])
    setTagFilter(parsed.tags ?? [])
    setPinnedOnly(!!parsed.pinnedOnly)
    setSort(parsed.sort ?? 'updated')
    setFiltersReady(true)
  }, [searchParams])

  const currentFilters = useMemo(() => (
    normalizeViewFilters({
      q: q.trim() ? q.trim() : null,
      type: typeFilter === 'all' ? null : typeFilter,
      statuses: statusFilter.length ? statusFilter : null,
      tags: tagFilter.length ? tagFilter : null,
      pinnedOnly: pinnedOnly ? true : null,
      sort: sort ?? null,
    })
  ), [q, typeFilter, statusFilter, tagFilter, pinnedOnly, sort])

  useEffect(() => {
    if (!filtersReady) return
    const nextParams = filtersToSearchParams(currentFilters)
    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true })
    }
  }, [currentFilters, searchParams, setSearchParams, filtersReady])

  useEffect(() => {
    if (!selectedViewId) return
    const activeView = savedViews.find(view => view.id === selectedViewId)
    if (!activeView) {
      setSelectedViewId(null)
      return
    }
    if (!areFiltersEqual(activeView.filters, currentFilters)) {
      setSelectedViewId(null)
    }
  }, [currentFilters, savedViews, selectedViewId])

  useEffect(() => {
    let active = true

    async function run() {
      if (!filtersReady) return
      setLoading(true)
      setErrorMessage(null)

      const { data, error } = await supabase.rpc('list_nodes', {
        lim: 200,
        q: currentFilters.q,
        type_filter: currentFilters.type,
        status_filter: currentFilters.statuses,
        tag_filter: currentFilters.tags,
        pinned_only: currentFilters.pinnedOnly ?? false,
        review_due_only: false,
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
  }, [currentFilters, filtersReady])

  useEffect(() => {
    let active = true

    async function loadViews() {
      setViewsLoading(true)
      const { data, error } = await supabase
        .from('saved_views')
        .select('id,name,filters,created_at,updated_at')
        .order('name', { ascending: true })

      if (!active) return
      setViewsLoading(false)

      if (error) {
        return
      }

      const rows = (data ?? []).map(row => {
        const rawFilters = (row as { filters?: unknown }).filters
        return {
          id: (row as { id: number }).id,
          name: (row as { name: string }).name,
          created_at: (row as { created_at: string }).created_at,
          updated_at: (row as { updated_at: string }).updated_at,
          filters: parseSavedViewFilters(rawFilters),
        }
      })

      setSavedViews(rows)
    }

    loadViews()
    return () => { active = false }
  }, [])

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

  function toggleStatus(status: Status) {
    setStatusFilter(prev => (
      prev.includes(status)
        ? prev.filter(item => item !== status)
        : [...prev, status]
    ))
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

  async function handleSaveView() {
    const name = window.prompt('Name this view')?.trim()
    if (!name) return

    const session = (await supabase.auth.getSession()).data.session
    if (!session) {
      alert('Not signed in.')
      return
    }

    const { data, error } = await supabase
      .from('saved_views')
      .insert({
        owner_id: session.user.id,
        name,
        filters: currentFilters,
      })
      .select('id,name,filters,created_at,updated_at')
      .single()

    if (error) {
      alert(error.message)
      return
    }

    const view = {
      id: (data as { id: number }).id,
      name: (data as { name: string }).name,
      created_at: (data as { created_at: string }).created_at,
      updated_at: (data as { updated_at: string }).updated_at,
      filters: parseSavedViewFilters((data as { filters?: unknown }).filters),
    }

    setSavedViews(prev => [...prev, view].sort((a, b) => a.name.localeCompare(b.name)))
    setSelectedViewId(view.id)
  }

  function applyView(view: SavedViewRow) {
    setQ(view.filters.q ?? '')
    setTypeFilter(view.filters.type ?? 'all')
    setStatusFilter(view.filters.statuses ?? [])
    setTagFilter(view.filters.tags ?? [])
    setPinnedOnly(!!view.filters.pinnedOnly)
    setSort(view.filters.sort ?? 'updated')
    setSelectedViewId(view.id)
  }

  async function handleRenameView(view: SavedViewRow) {
    const name = window.prompt('Rename view', view.name)?.trim()
    if (!name || name === view.name) return

    const { data, error } = await supabase
      .from('saved_views')
      .update({ name })
      .eq('id', view.id)
      .select('id,name,filters,created_at,updated_at')
      .single()

    if (error) {
      alert(error.message)
      return
    }

    setSavedViews(prev => prev.map(item => (
      item.id === view.id
        ? {
          id: (data as { id: number }).id,
          name: (data as { name: string }).name,
          created_at: (data as { created_at: string }).created_at,
          updated_at: (data as { updated_at: string }).updated_at,
          filters: parseSavedViewFilters((data as { filters?: unknown }).filters),
        }
        : item
    )).sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function handleUpdateView(view: SavedViewRow) {
    const { data, error } = await supabase
      .from('saved_views')
      .update({ filters: currentFilters })
      .eq('id', view.id)
      .select('id,name,filters,created_at,updated_at')
      .single()

    if (error) {
      alert(error.message)
      return
    }

    setSavedViews(prev => prev.map(item => (
      item.id === view.id
        ? {
          id: (data as { id: number }).id,
          name: (data as { name: string }).name,
          created_at: (data as { created_at: string }).created_at,
          updated_at: (data as { updated_at: string }).updated_at,
          filters: parseSavedViewFilters((data as { filters?: unknown }).filters),
        }
        : item
    )))
  }

  async function handleDeleteView(view: SavedViewRow) {
    if (!window.confirm(`Delete view "${view.name}"?`)) return

    const { error } = await supabase
      .from('saved_views')
      .delete()
      .eq('id', view.id)

    if (error) {
      alert(error.message)
      return
    }

    setSavedViews(prev => prev.filter(item => item.id !== view.id))
    if (selectedViewId === view.id) setSelectedViewId(null)
  }

  const hasFilters = currentFilters.q || currentFilters.type || (currentFilters.tags?.length ?? 0) > 0
    || (currentFilters.statuses?.length ?? 0) > 0 || currentFilters.pinnedOnly

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

  const sortedRows = useMemo(() => sortRows(rows, sort), [rows, sort])
  const selectedView = savedViews.find(view => view.id === selectedViewId) ?? null

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

        <div style={{ display: 'grid', gap: 8 }}>
          <label style={{ fontSize: 12, opacity: 0.7 }}>Statuses</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {STATUSES.map(status => (
              <button
                key={status}
                type="button"
                onClick={() => toggleStatus(status)}
                style={{
                  border: statusFilter.includes(status) ? '1px solid #7aa2ff' : '1px solid #333',
                  background: statusFilter.includes(status) ? 'rgba(122, 162, 255, 0.2)' : 'transparent',
                }}
              >
                {status}
              </button>
            ))}
            {statusFilter.length > 0 && (
              <button type="button" onClick={() => setStatusFilter([])}>
                Clear statuses
              </button>
            )}
          </div>
        </div>

        <TagInput value={tagFilter} onChange={setTagFilter} placeholder="Filter tags" />

        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
          <input
            type="checkbox"
            checked={pinnedOnly}
            onChange={(event) => setPinnedOnly(event.target.checked)}
          />
          Pinned only
        </label>

        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontSize: 12, opacity: 0.7 }}>Sort</label>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as ViewSort)}
            style={{ padding: 10, fontSize: 14, width: 'fit-content' }}
          >
            <option value="updated">Updated</option>
            <option value="created">Created</option>
            <option value="relevance">Relevance</option>
          </select>
        </div>

        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setQ('')
              setTypeFilter('all')
              setStatusFilter([])
              setTagFilter([])
              setPinnedOnly(false)
              setSort('updated')
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

      <div
        style={{
          border: '1px solid #333',
          borderRadius: 12,
          padding: 12,
          marginBottom: 16,
          display: 'grid',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>Saved views</strong>
          <button type="button" onClick={handleSaveView}>
            Save view
          </button>
        </div>
        {viewsLoading && <span style={{ fontSize: 12, opacity: 0.7 }}>Loading views…</span>}
        {!viewsLoading && savedViews.length === 0 && (
          <span style={{ fontSize: 12, opacity: 0.6 }}>No saved views yet.</span>
        )}
        {savedViews.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {savedViews.map(view => (
              <button
                key={view.id}
                type="button"
                onClick={() => applyView(view)}
                disabled={selectedViewId === view.id}
                style={{
                  border: selectedViewId === view.id ? '1px solid #7aa2ff' : '1px solid #333',
                  background: selectedViewId === view.id ? 'rgba(122, 162, 255, 0.2)' : 'transparent',
                }}
              >
                {view.name}
              </button>
            ))}
          </div>
        )}
        {selectedView && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => handleRenameView(selectedView)}>Rename</button>
            <button type="button" onClick={() => handleUpdateView(selectedView)}>Update filters</button>
            <button type="button" onClick={() => handleDeleteView(selectedView)}>Delete</button>
          </div>
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

          {sortedRows.map(row => (
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
                <Link to={`/node/${row.id}`} style={{ textDecoration: 'none', color: '#fff' }}>
                  <strong style={{ fontSize: 14 }}>{row.title}</strong>
                </Link>
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
