import { useNavigate } from 'react-router-dom'
import TagChips from './TagChips'

type RecentRow = {
  id: number
  title: string
  type: string
  status: string
  created_at: string
  updated_at?: string | null
  pinned?: boolean | null
  tags?: string[] | null
}

type RecentCapturesProps = {
  items: RecentRow[]
  loading: boolean
  onRefresh: () => void
  onTogglePinned: (row: RecentRow) => void
  onMarkDone: (row: RecentRow) => void
  onArchive: (row: RecentRow) => void
}

export default function RecentCaptures({
  items,
  loading,
  onRefresh,
  onTogglePinned,
  onMarkDone,
  onArchive,
}: RecentCapturesProps) {
  const navigate = useNavigate()

  return (
    <section className="card captureRecent">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>Recent captures</strong>
        <button type="button" className="button button--ghost" onClick={onRefresh}>
          Refresh
        </button>
      </div>
      {loading && <span className="muted" style={{ fontSize: 12 }}>Loading…</span>}
      {!loading && items.length === 0 && (
        <span className="muted" style={{ fontSize: 12 }}>No recent captures yet.</span>
      )}
      {items.length > 0 && (
        <div className="stack-sm">
          {items.map(row => (
            <div key={row.id} className="captureRecentItem">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <button
                  type="button"
                  onClick={() => navigate(`/node/${row.id}`)}
                  className="button button--ghost"
                  style={{ padding: 0, fontWeight: 600 }}
                >
                  {row.title}
                </button>
                <span className="muted" style={{ fontSize: 12 }}>{row.type}</span>
              </div>
              <div className="row row--wrap">
                <span className="chip chip--compact">{row.status}</span>
                {row.pinned && <span className="chip chip--compact">pinned</span>}
                {Array.isArray(row.tags) && row.tags.length > 0 && (
                  <TagChips tags={row.tags} compact />
                )}
              </div>
              <div className="captureRecentActions">
                <button
                  type="button"
                  className="chip chip--compact chip--clickable"
                  onClick={() => onTogglePinned(row)}
                >
                  {row.pinned ? 'Unpin' : 'Pin'}
                </button>
                {row.type === 'task' ? (
                  <button
                    type="button"
                    className="chip chip--compact chip--clickable"
                    onClick={() => onMarkDone(row)}
                  >
                    {row.status === 'done' ? 'Undone' : 'Done'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="chip chip--compact chip--clickable"
                    onClick={() => onArchive(row)}
                  >
                    Archive
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export type { RecentRow }
