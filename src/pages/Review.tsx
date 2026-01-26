import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import TagInput from '../components/TagInput'
import { STATUSES, type Status } from '../utils/status'

type NodeRow = {
  id: number
  type: string
  title: string
  body: string | null
  status: Status
  created_at: string
  updated_at?: string | null
  review_after?: string | null
  pinned?: boolean | null
  tags?: string[] | null
}

type BucketKey = '7' | '30' | '90'

const BUCKETS: { key: BucketKey; label: string; threshold: number }[] = [
  { key: '7', label: '7+ days', threshold: 7 },
  { key: '30', label: '30+ days', threshold: 30 },
  { key: '90', label: '90+ days', threshold: 90 },
]

function normalizeTag(raw: string) {
  return raw.trim().toLowerCase()
}

function daysSince(value?: string | null) {
  const fallback = value ? new Date(value).getTime() : NaN
  if (Number.isNaN(fallback)) return 0
  const diffMs = Date.now() - fallback
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

function formatDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString()
}

export default function Review() {
  const [rows, setRows] = useState<NodeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [bucket, setBucket] = useState<BucketKey>('7')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [workingIds, setWorkingIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setErrorMessage(null)

      const { data, error } = await supabase.rpc('list_nodes', {
        lim: 500,
        q: null,
        type_filter: null,
        status_filter: null,
        tag_filter: null,
        pinned_only: false,
        review_due_only: true,
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

    load()
    return () => { active = false }
  }, [])

  const bucketed = useMemo(() => {
    const now = Date.now()
    const groups: Record<BucketKey, NodeRow[]> = { '7': [], '30': [], '90': [] }

    for (const row of rows) {
      const updatedValue = row.updated_at ?? row.created_at
      const updatedAt = new Date(updatedValue).getTime()
      const ageDays = Math.floor((now - updatedAt) / (1000 * 60 * 60 * 24))
      if (ageDays >= 90) groups['90'].push(row)
      else if (ageDays >= 30) groups['30'].push(row)
      else if (ageDays >= 7) groups['7'].push(row)
    }

    for (const key of Object.keys(groups) as BucketKey[]) {
      groups[key].sort((a, b) => {
        const aValue = new Date(a.updated_at ?? a.created_at).getTime()
        const bValue = new Date(b.updated_at ?? b.created_at).getTime()
        return aValue - bValue
      })
    }

    return groups
  }, [rows])

  useEffect(() => {
    const list = bucketed[bucket]
    if (list.length === 0) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !list.some(row => row.id === selectedId)) {
      setSelectedId(list[0].id)
    }
  }, [bucket, bucketed, selectedId])

  const selectedRow = rows.find(row => row.id === selectedId) ?? null

  function withWorking(id: number, working: boolean) {
    setWorkingIds(prev => {
      const next = new Set(prev)
      if (working) next.add(id)
      else next.delete(id)
      return next
    })
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

  async function syncTags(nodeId: number, names: string[]) {
    const desiredTags = Array.from(new Set(names.map(normalizeTag).filter(Boolean)))
    const tagMap = await upsertTags(desiredTags)
    const desiredTagIds = Array.from(tagMap.values())

    const { data, error } = await supabase
      .from('node_tags')
      .select('tag_id')
      .eq('node_id', nodeId)

    if (error) throw error

    const existingTagIds = new Set<number>()
    for (const row of data ?? []) {
      const tagId = (row as { tag_id: number }).tag_id
      if (typeof tagId === 'number') existingTagIds.add(tagId)
    }

    if (desiredTagIds.length === 0) {
      if (existingTagIds.size > 0) {
        const { error: deleteAllError } = await supabase
          .from('node_tags')
          .delete()
          .eq('node_id', nodeId)

        if (deleteAllError) throw deleteAllError
      }
      return
    }

    const toInsert: { node_id: number; tag_id: number }[] = []
    for (const tagId of desiredTagIds) {
      if (!existingTagIds.has(tagId)) {
        toInsert.push({ node_id: nodeId, tag_id: tagId })
      }
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('node_tags')
        .upsert(toInsert, { onConflict: 'node_id,tag_id' })

      if (insertError) throw insertError
    }

    const removeTagIds = Array.from(existingTagIds).filter(id => !desiredTagIds.includes(id))
    if (removeTagIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('node_tags')
        .delete()
        .eq('node_id', nodeId)
        .in('tag_id', removeTagIds)

      if (deleteError) throw deleteError
    }
  }

  async function updateStatus(nodeId: number, nextStatus: Status) {
    const previous = rows
    setRows(prev => prev.map(row => (row.id === nodeId ? { ...row, status: nextStatus } : row)))

    const { error } = await supabase.rpc('set_node_status', {
      node_id: nodeId,
      new_status: nextStatus,
    })

    if (error) {
      setRows(previous)
      throw error
    }
  }

  async function updatePinned(nodeId: number, pinned: boolean) {
    const previous = rows
    setRows(prev => prev.map(row => (row.id === nodeId ? { ...row, pinned } : row)))

    const { error } = await supabase.rpc('set_node_pinned', {
      node_id: nodeId,
      pinned,
    })

    if (error) {
      setRows(previous)
      throw error
    }
  }

  async function updateReviewAfter(nodeId: number, reviewAfter: string | null) {
    const previous = rows
    setRows(prev => prev.map(row => (row.id === nodeId ? { ...row, review_after: reviewAfter } : row)))

    const { error } = await supabase.rpc('set_node_review_after', {
      node_id: nodeId,
      review_after: reviewAfter,
    })

    if (error) {
      setRows(previous)
      throw error
    }

    if (reviewAfter) {
      const nextDate = new Date(reviewAfter).getTime()
      if (!Number.isNaN(nextDate) && nextDate > Date.now()) {
        setRows(prev => prev.filter(row => row.id !== nodeId))
      }
    }
  }

  async function handleTagsChange(nodeId: number, nextTags: string[]) {
    const previous = rows
    setRows(prev => prev.map(row => (row.id === nodeId ? { ...row, tags: nextTags } : row)))

    try {
      await syncTags(nodeId, nextTags)
    } catch (error) {
      setRows(previous)
      alert((error as Error).message)
    }
  }

  async function handleSnooze(nodeId: number, days: number) {
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
    withWorking(nodeId, true)
    try {
      await updateReviewAfter(nodeId, until)
    } catch (error) {
      alert((error as Error).message)
    } finally {
      withWorking(nodeId, false)
    }
  }

  async function handleArchive(nodeId: number) {
    withWorking(nodeId, true)
    try {
      await updateStatus(nodeId, 'archived')
    } catch (error) {
      alert((error as Error).message)
    } finally {
      withWorking(nodeId, false)
    }
  }

  async function handlePromote(row: NodeRow) {
    withWorking(row.id, true)
    try {
      if (row.type === 'task') {
        await updateStatus(row.id, 'active')
      } else {
        await updatePinned(row.id, true)
      }
    } catch (error) {
      alert((error as Error).message)
    } finally {
      withWorking(row.id, false)
    }
  }

  async function handleTogglePinned(row: NodeRow) {
    withWorking(row.id, true)
    try {
      await updatePinned(row.id, !row.pinned)
    } catch (error) {
      alert((error as Error).message)
    } finally {
      withWorking(row.id, false)
    }
  }

  if (loading) return <div className="muted">Loading…</div>

  if (errorMessage) {
    return (
      <div>
        <p style={{ color: '#f87171' }}>{errorMessage}</p>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="stack-sm">
        <h2>Review</h2>
        <p className="muted" style={{ fontSize: 12 }}>Triage items due for review.</p>
      </div>

      <div className="row row--wrap" style={{ alignItems: 'stretch' }}>
        <aside
          className="card"
          style={{ flex: '1 1 220px', display: 'grid', gap: 12 }}
        >
          <div className="stack-sm">
            {BUCKETS.map(entry => (
              <button
                key={entry.key}
                type="button"
                onClick={() => setBucket(entry.key)}
                disabled={bucket === entry.key}
                className={`button ${bucket === entry.key ? 'button--primary' : 'button--ghost'}`}
                style={{ justifyContent: 'space-between' }}
              >
                <span>{entry.label}</span>
                <span className="muted" style={{ fontSize: 12 }}>{bucketed[entry.key].length}</span>
              </button>
            ))}
          </div>

          <div className="stack-sm">
            {bucketed[bucket].length === 0 && (
              <span className="muted" style={{ fontSize: 12 }}>No items in this bucket.</span>
            )}
            {bucketed[bucket].map(row => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelectedId(row.id)}
                className={`card ${selectedId === row.id ? 'chip--selected' : ''}`}
                style={{ textAlign: 'left', padding: 10, display: 'grid', gap: 6 }}
              >
                <strong style={{ fontSize: 14 }}>{row.title}</strong>
                <span className="muted" style={{ fontSize: 11 }}>
                  {row.type} • {row.status}
                </span>
                <span className="muted" style={{ fontSize: 11 }}>
                  Last touched {formatDate(row.updated_at ?? row.created_at)} ({daysSince(row.updated_at ?? row.created_at)}d)
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section
          className="card"
          style={{ flex: '2 1 320px', display: 'grid', gap: 16, minHeight: 320 }}
        >
          {!selectedRow && (
            <div className="muted" style={{ fontSize: 12 }}>Select an item to review.</div>
          )}

          {selectedRow && (
            <>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="stack-sm">
                  <strong style={{ fontSize: 16 }}>{selectedRow.title}</strong>
                  <span className="muted" style={{ fontSize: 12 }}>{selectedRow.type} • {selectedRow.status}</span>
                </div>
                <Link to={`/node/${selectedRow.id}`} className="muted" style={{ fontSize: 12 }}>Open Node Detail</Link>
              </div>

              {selectedRow.body && (
                <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>
                  {selectedRow.body.slice(0, 400)}{selectedRow.body.length > 400 ? '…' : ''}
                </div>
              )}

              <div className="stack-sm">
                <label className="muted" style={{ fontSize: 12 }}>Status</label>
                <select
                  value={selectedRow.status}
                  onChange={(event) => {
                    const next = event.target.value as Status
                    withWorking(selectedRow.id, true)
                    updateStatus(selectedRow.id, next)
                      .catch(error => alert((error as Error).message))
                      .finally(() => withWorking(selectedRow.id, false))
                  }}
                  disabled={workingIds.has(selectedRow.id)}
                  className="select"
                >
                  {STATUSES.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>

              <div className="stack-sm">
                <label className="muted" style={{ fontSize: 12 }}>Tags</label>
                <TagInput
                  value={selectedRow.tags ?? []}
                  onChange={(next) => handleTagsChange(selectedRow.id, next)}
                  placeholder="Add tags"
                />
              </div>

              <div className="row row--wrap">
                <button
                  type="button"
                  onClick={() => handleSnooze(selectedRow.id, 7)}
                  disabled={workingIds.has(selectedRow.id)}
                  className="button button--ghost"
                >
                  Snooze 7d
                </button>
                <button
                  type="button"
                  onClick={() => handleSnooze(selectedRow.id, 30)}
                  disabled={workingIds.has(selectedRow.id)}
                  className="button button--ghost"
                >
                  Snooze 30d
                </button>
                <button
                  type="button"
                  onClick={() => handleSnooze(selectedRow.id, 90)}
                  disabled={workingIds.has(selectedRow.id)}
                  className="button button--ghost"
                >
                  Snooze 90d
                </button>
                <button
                  type="button"
                  onClick={() => handlePromote(selectedRow)}
                  disabled={workingIds.has(selectedRow.id)}
                  className="button button--primary"
                >
                  Promote
                </button>
                <button
                  type="button"
                  onClick={() => handleArchive(selectedRow.id)}
                  disabled={workingIds.has(selectedRow.id)}
                  className="button button--ghost"
                >
                  Archive
                </button>
                <button
                  type="button"
                  onClick={() => handleTogglePinned(selectedRow)}
                  disabled={workingIds.has(selectedRow.id)}
                  className="button button--ghost"
                >
                  {selectedRow.pinned ? 'Unpin' : 'Pin'}
                </button>
              </div>

            </>
          )}
        </section>
      </div>
    </div>
  )
}
