import type { ViewFilters } from '../utils/viewFilters'

type SavedViewRow = {
  id: number
  name: string
  filters: ViewFilters
  created_at: string
  updated_at: string
}

type SavedViewsPanelProps = {
  views: SavedViewRow[]
  loading: boolean
  selectedViewId: number | null
  onSaveView: () => void
  onApplyView: (view: SavedViewRow) => void
  onRenameView: (view: SavedViewRow) => void
  onUpdateView: (view: SavedViewRow) => void
  onDeleteView: (view: SavedViewRow) => void
}

export default function SavedViewsPanel({
  views,
  loading,
  selectedViewId,
  onSaveView,
  onApplyView,
  onRenameView,
  onUpdateView,
  onDeleteView,
}: SavedViewsPanelProps) {
  const selectedView = views.find(view => view.id === selectedViewId) ?? null

  return (
    <div className="card" style={{ display: 'grid', gap: 8 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>Saved views</strong>
        <button type="button" onClick={onSaveView} className="button button--ghost">
          Save view
        </button>
      </div>
      {loading && <span className="muted" style={{ fontSize: 12 }}>Loading views…</span>}
      {!loading && views.length === 0 && (
        <span className="muted" style={{ fontSize: 12 }}>No saved views yet.</span>
      )}
      {views.length > 0 && (
        <div className="row row--wrap">
          {views.map(view => (
            <button
              key={view.id}
              type="button"
              onClick={() => onApplyView(view)}
              disabled={selectedViewId === view.id}
              className={`chip chip--clickable${selectedViewId === view.id ? ' chip--selected' : ''}`}
            >
              {view.name}
            </button>
          ))}
        </div>
      )}
      {selectedView && (
        <div className="row row--wrap">
          <button type="button" onClick={() => onRenameView(selectedView)} className="button button--ghost">Rename</button>
          <button type="button" onClick={() => onUpdateView(selectedView)} className="button button--ghost">Update filters</button>
          <button type="button" onClick={() => onDeleteView(selectedView)} className="button button--ghost">Delete</button>
        </div>
      )}
    </div>
  )
}

export type { SavedViewRow }
