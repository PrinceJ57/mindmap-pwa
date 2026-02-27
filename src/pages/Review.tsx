import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import TagInput from '../components/TagInput'
import { useToast } from '../components/Toast'
import { STATUSES, type Status } from '../utils/status'
import { normalizeTag } from '../utils/tagUtils'

type NodeRow = {
  id: number
  type: 'idea' | 'task'
  title: string
  body: string | null
  status: Status
  context: string | null
  due_at: string | null
  created_at: string
  updated_at?: string | null
  pinned?: boolean | null
  tags?: string[] | null
}

type EditingState = {
  title: string
  body: string
  type: 'idea' | 'task'
  status: Status
  context: string
  due_at: string
  tags: string[]
}

function formatDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString()
}

export default function Review() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<NodeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [hasChanges, setHasChanges] = useState(false)

  // Load inbox items
  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setErrorMessage(null)

      const { data, error } = await supabase.rpc('list_nodes', {
        lim: 200,
        q: null,
        type_filter: null,
        status_filter: ['inbox'],
        tag_filter: null,
        pinned_only: false,
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
      setLoading(false)
    }

    load()
    return () => { active = false }
  }, [])

  // Update editing state when selection changes
  useEffect(() => {
    if (!selectedId) {
      setEditing(null)
      setHasChanges(false)
      return
    }

    const row = rows.find(r => r.id === selectedId)
    if (!row) {
      setEditing(null)
      setHasChanges(false)
      return
    }

    setEditing({
      title: row.title,
      body: row.body ?? '',
      type: row.type as 'idea' | 'task',
      status: row.status,
      context: row.context ?? '',
      due_at: row.due_at ?? '',
      tags: row.tags ?? [],
    })
    setHasChanges(false)
  }, [selectedId, rows])

  // Auto-select first item
  useEffect(() => {
    if (rows.length > 0 && !selectedId) {
      setSelectedId(rows[0].id)
    } else if (selectedId && !rows.find(r => r.id === selectedId)) {
      setSelectedId(rows.length > 0 ? rows[0].id : null)
    }
  }, [rows, selectedId])

  const selectedRow = rows.find(r => r.id === selectedId) ?? null

  function updateEditing(updates: Partial<EditingState>) {
    if (!editing) return
    setEditing({ ...editing, ...updates })
    setHasChanges(true)
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

  async function handleSave() {
    if (!selectedId || !editing) return

    setSaving(true)
    try {
      // Update the node
      const { error } = await supabase
        .from('nodes')
        .update({
          title: editing.title.trim(),
          body: editing.body.trim() || null,
          type: editing.type,
          status: editing.status,
          context: editing.context.trim() || null,
          due_at: editing.due_at || null,
        })
        .eq('id', selectedId)

      if (error) throw error

      // Sync tags
      await syncTags(selectedId, editing.tags)

      // Update local state
      setRows(prev => prev.map(row =>
        row.id === selectedId
          ? {
              ...row,
              title: editing.title.trim(),
              body: editing.body.trim() || null,
              type: editing.type,
              status: editing.status,
              context: editing.context.trim() || null,
              due_at: editing.due_at || null,
              tags: editing.tags,
            }
          : row
      ))

      setHasChanges(false)
      showToast('success', 'Saved!')

      // If status changed from inbox, remove from list
      if (editing.status !== 'inbox') {
        setRows(prev => prev.filter(row => row.id !== selectedId))
      }
    } catch (error) {
      showToast('error', (error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handlePublish() {
    if (!selectedId || !editing) return

    // Set status to active and save
    const publishedEditing = { ...editing, status: 'active' as Status }
    setEditing(publishedEditing)

    setSaving(true)
    try {
      const { error } = await supabase
        .from('nodes')
        .update({
          title: publishedEditing.title.trim(),
          body: publishedEditing.body.trim() || null,
          type: publishedEditing.type,
          status: 'active',
          context: publishedEditing.context.trim() || null,
          due_at: publishedEditing.due_at || null,
        })
        .eq('id', selectedId)

      if (error) throw error

      await syncTags(selectedId, publishedEditing.tags)

      // Remove from inbox list
      setRows(prev => prev.filter(row => row.id !== selectedId))
      showToast('success', 'Published!')
    } catch (error) {
      showToast('error', (error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive() {
    if (!selectedId) return

    setSaving(true)
    try {
      const { error } = await supabase.rpc('set_node_status', {
        node_id: selectedId,
        new_status: 'archived',
      })

      if (error) throw error

      setRows(prev => prev.filter(row => row.id !== selectedId))
      showToast('success', 'Archived!')
    } catch (error) {
      showToast('error', (error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!selectedId) return

    if (!window.confirm('Delete this item permanently?')) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('nodes')
        .delete()
        .eq('id', selectedId)

      if (error) throw error

      setRows(prev => prev.filter(row => row.id !== selectedId))
      showToast('success', 'Deleted!')
    } catch (error) {
      showToast('error', (error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="muted">Loading inbox…</div>

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
        <h2>Inbox</h2>
        <p className="muted" style={{ fontSize: 12 }}>
          {rows.length === 0
            ? 'All caught up! Capture new ideas to see them here.'
            : `${rows.length} item${rows.length !== 1 ? 's' : ''} to process. Add details and publish when ready.`
          }
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✨</div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Inbox Zero!</div>
          <div className="muted" style={{ fontSize: 13 }}>
            Your inbox is empty. Head to Capture to jot down new ideas.
          </div>
        </div>
      ) : (
        <div className="row row--wrap" style={{ alignItems: 'stretch' }}>
          {/* Inbox list */}
          <aside
            className="card"
            style={{ flex: '1 1 220px', display: 'grid', gap: 8, maxHeight: 500, overflowY: 'auto' }}
          >
            {rows.map(row => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelectedId(row.id)}
                className={`card ${selectedId === row.id ? 'chip--selected' : ''}`}
                style={{ textAlign: 'left', padding: 10, display: 'grid', gap: 4 }}
              >
                <strong style={{ fontSize: 14 }}>{row.title}</strong>
                <span className="muted" style={{ fontSize: 11 }}>
                  {formatDate(row.created_at)}
                  {row.tags && row.tags.length > 0 && ` • ${row.tags.length} tag${row.tags.length !== 1 ? 's' : ''}`}
                </span>
              </button>
            ))}
          </aside>

          {/* Detail panel */}
          <section
            className="card"
            style={{ flex: '2 1 320px', display: 'grid', gap: 16 }}
          >
            {!selectedRow && (
              <div className="muted" style={{ fontSize: 12 }}>Select an item to edit.</div>
            )}

            {selectedRow && editing && (
              <>
                {/* Title */}
                <div className="stack-sm">
                  <label className="muted" style={{ fontSize: 12 }}>Title</label>
                  <input
                    type="text"
                    value={editing.title}
                    onChange={(e) => updateEditing({ title: e.target.value })}
                    className="input"
                    placeholder="What's the idea?"
                  />
                </div>

                {/* Body */}
                <div className="stack-sm">
                  <label className="muted" style={{ fontSize: 12 }}>Notes</label>
                  <textarea
                    value={editing.body}
                    onChange={(e) => updateEditing({ body: e.target.value })}
                    className="textarea"
                    rows={3}
                    placeholder="Add details, context, or notes…"
                  />
                </div>

                {/* Type & Status row */}
                <div className="row row--wrap" style={{ gap: 16 }}>
                  <div className="stack-sm" style={{ flex: '1 1 120px' }}>
                    <label className="muted" style={{ fontSize: 12 }}>Type</label>
                    <select
                      value={editing.type}
                      onChange={(e) => updateEditing({ type: e.target.value as 'idea' | 'task' })}
                      className="select"
                    >
                      <option value="idea">Idea</option>
                      <option value="task">Task</option>
                    </select>
                  </div>

                  <div className="stack-sm" style={{ flex: '1 1 120px' }}>
                    <label className="muted" style={{ fontSize: 12 }}>Status</label>
                    <select
                      value={editing.status}
                      onChange={(e) => updateEditing({ status: e.target.value as Status })}
                      className="select"
                    >
                      {STATUSES.map(status => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Context & Due date row */}
                <div className="row row--wrap" style={{ gap: 16 }}>
                  <div className="stack-sm" style={{ flex: '1 1 140px' }}>
                    <label className="muted" style={{ fontSize: 12 }}>Context</label>
                    <input
                      type="text"
                      value={editing.context}
                      onChange={(e) => updateEditing({ context: e.target.value })}
                      className="input"
                      placeholder="@home, @work, etc."
                    />
                  </div>

                  <div className="stack-sm" style={{ flex: '1 1 140px' }}>
                    <label className="muted" style={{ fontSize: 12 }}>Due date</label>
                    <input
                      type="date"
                      value={editing.due_at}
                      onChange={(e) => updateEditing({ due_at: e.target.value })}
                      className="input"
                    />
                  </div>
                </div>

                {/* Tags */}
                <div className="stack-sm">
                  <label className="muted" style={{ fontSize: 12 }}>Tags</label>
                  <TagInput
                    value={editing.tags}
                    onChange={(tags) => updateEditing({ tags })}
                    placeholder="Add tags"
                  />
                </div>

                {/* Actions */}
                <div className="row row--wrap" style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={saving || !editing.title.trim()}
                    className="button button--primary"
                  >
                    {saving ? 'Saving…' : 'Publish'}
                  </button>
                  {hasChanges && (
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving || !editing.title.trim()}
                      className="button button--ghost"
                    >
                      Save draft
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleArchive}
                    disabled={saving}
                    className="button button--ghost"
                  >
                    Archive
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={saving}
                    className="button button--ghost"
                    style={{ color: '#f87171' }}
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
