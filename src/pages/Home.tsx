import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import TagChips from '../components/TagChips'
import { filtersToQueryString, normalizeViewFilters, type ViewFilters } from '../utils/viewFilters'

const PANEL_LIMIT = 10

type NodeRow = {
  id: number
  type: string
  title: string
  body: string | null
  status: string
  created_at: string
  updated_at?: string | null
  tags?: string[] | null
}

type SavedViewRow = {
  id: number
  name: string
  filters: ViewFilters
}

function normalizeTag(raw: string) {
  return raw.trim().toLowerCase()
}

function parseSavedViewFilters(raw: unknown): ViewFilters {
  if (!raw || typeof raw !== 'object') {
    return normalizeViewFilters({})
  }
  return normalizeViewFilters(raw as Partial<ViewFilters>)
}

function formatUpdated(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString()
}

export default function Home() {
  const [inboxItems, setInboxItems] = useState<NodeRow[]>([])
  const [activeTasks, setActiveTasks] = useState<NodeRow[]>([])
  const [pinnedItems, setPinnedItems] = useState<NodeRow[]>([])
  const [recentItems, setRecentItems] = useState<NodeRow[]>([])
  const [inboxCount, setInboxCount] = useState<number | null>(null)
  const [savedViews, setSavedViews] = useState<SavedViewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setErrorMessage(null)

      const inboxPromise = supabase.rpc('list_nodes', {
        lim: PANEL_LIMIT,
        q: null,
        type_filter: null,
        status_filter: ['inbox'],
        tag_filter: null,
        pinned_only: false,
        review_due_only: false,
      })

      const activePromise = supabase.rpc('list_nodes', {
        lim: PANEL_LIMIT,
        q: null,
        type_filter: 'task',
        status_filter: ['active'],
        tag_filter: null,
        pinned_only: false,
        review_due_only: false,
      })

      const pinnedPromise = supabase.rpc('list_nodes', {
        lim: PANEL_LIMIT,
        q: null,
        type_filter: null,
        status_filter: null,
        tag_filter: null,
        pinned_only: true,
        review_due_only: false,
      })

      const recentPromise = supabase.rpc('list_nodes', {
        lim: PANEL_LIMIT,
        q: null,
        type_filter: null,
        status_filter: null,
        tag_filter: null,
        pinned_only: false,
        review_due_only: false,
      })

      const savedViewsPromise = supabase
        .from('saved_views')
        .select('id,name,filters')
        .order('name', { ascending: true })

      const inboxCountPromise = supabase
        .from('nodes')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'inbox')

      const results = await Promise.all([
        inboxPromise,
        activePromise,
        pinnedPromise,
        recentPromise,
        savedViewsPromise,
        inboxCountPromise,
      ])

      if (!active) return

      const [inboxRes, activeRes, pinnedRes, recentRes, savedRes, inboxCountRes] = results

      if (inboxRes.error || activeRes.error || pinnedRes.error || recentRes.error || savedRes.error) {
        setErrorMessage(
          inboxRes.error?.message
            ?? activeRes.error?.message
            ?? pinnedRes.error?.message
            ?? recentRes.error?.message
            ?? savedRes.error?.message
            ?? 'Unable to load dashboard.'
        )
        setLoading(false)
        return
      }

      const normalizeRows = (data: unknown): NodeRow[] => ((data ?? []) as NodeRow[]).map(row => ({
        ...row,
        tags: Array.isArray(row.tags) ? row.tags.map(normalizeTag) : [],
      }))

      const recentSorted = normalizeRows(recentRes.data).sort((a, b) => {
        const aValue = new Date(a.updated_at ?? a.created_at).getTime()
        const bValue = new Date(b.updated_at ?? b.created_at).getTime()
        return bValue - aValue
      })

      setInboxItems(normalizeRows(inboxRes.data))
      setActiveTasks(normalizeRows(activeRes.data))
      setPinnedItems(normalizeRows(pinnedRes.data))
      setRecentItems(recentSorted)

      const viewRows = (savedRes.data ?? []).map(row => ({
        id: (row as { id: number }).id,
        name: (row as { name: string }).name,
        filters: parseSavedViewFilters((row as { filters?: unknown }).filters),
      }))
      setSavedViews(viewRows)

      if (inboxCountRes.error) {
        setInboxCount(null)
      } else {
        setInboxCount(inboxCountRes.count ?? null)
      }
      setLoading(false)
    }

    load()
    return () => { active = false }
  }, [])

  const panels = useMemo(() => ([
    { title: 'Inbox', count: inboxCount, rows: inboxItems },
    { title: 'Active tasks', count: null, rows: activeTasks },
    { title: 'Pinned', count: null, rows: pinnedItems },
    { title: 'Recently updated', count: null, rows: recentItems },
  ]), [inboxCount, inboxItems, activeTasks, pinnedItems, recentItems])

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>

  if (errorMessage) {
    return (
      <div style={{ padding: 16 }}>
        <p style={{ color: '#ff8080' }}>{errorMessage}</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h2 style={{ marginBottom: 6 }}>Home</h2>
        <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>Quick view of what needs attention.</p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
        }}
      >
        {panels.map(panel => (
          <section
            key={panel.title}
            style={{
              border: '1px solid #333',
              borderRadius: 12,
              padding: 12,
              display: 'grid',
              gap: 10,
              minHeight: 220,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{panel.title}</strong>
              {panel.count !== null && (
                <span style={{ fontSize: 12, opacity: 0.7 }}>{panel.count}</span>
              )}
            </div>

            {panel.rows.length === 0 && (
              <span style={{ fontSize: 12, opacity: 0.6 }}>No items.</span>
            )}

            {panel.rows.map(row => (
              <div key={row.id} style={{ display: 'grid', gap: 6, borderTop: '1px solid #222', paddingTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <Link to={`/node/${row.id}`} style={{ color: '#fff', textDecoration: 'none' }}>
                    <strong style={{ fontSize: 14 }}>{row.title}</strong>
                  </Link>
                  <span style={{ fontSize: 11, opacity: 0.7 }}>{row.type}</span>
                </div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>
                  {(() => {
                    const updatedLabel = formatUpdated(row.updated_at ?? row.created_at)
                    return `${row.status}${updatedLabel ? ` • ${updatedLabel}` : ''}`
                  })()}
                </div>
                <TagChips tags={row.tags ?? []} compact />
              </div>
            ))}
          </section>
        ))}
      </div>

      <section
        style={{
          border: '1px solid #333',
          borderRadius: 12,
          padding: 12,
          display: 'grid',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>Saved views</strong>
          <Link to="/outline" style={{ fontSize: 12, opacity: 0.7 }}>Open Outline</Link>
        </div>
        {savedViews.length === 0 && (
          <span style={{ fontSize: 12, opacity: 0.6 }}>Create a saved view from Outline filters.</span>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {savedViews.map(view => (
            <Link
              key={view.id}
              to={`/outline${filtersToQueryString(view.filters)}`}
              style={{
                border: '1px solid #333',
                borderRadius: 999,
                padding: '6px 12px',
                fontSize: 12,
                color: '#fff',
                textDecoration: 'none',
                background: '#111',
              }}
            >
              {view.name}
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
