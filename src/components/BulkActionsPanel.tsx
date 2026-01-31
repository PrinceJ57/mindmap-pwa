import TagInput from './TagInput'
import { STATUSES, type Status } from '../utils/status'

type BulkActionsPanelProps = {
  selectedCount: number
  working: boolean
  bulkStatus: Status | ''
  onBulkStatusChange: (value: Status | '') => void
  onApplyBulkStatus: () => void
  bulkTags: string[]
  onBulkTagsChange: (value: string[]) => void
  onApplyBulkTags: () => void
}

export default function BulkActionsPanel({
  selectedCount,
  working,
  bulkStatus,
  onBulkStatusChange,
  onApplyBulkStatus,
  bulkTags,
  onBulkTagsChange,
  onApplyBulkTags,
}: BulkActionsPanelProps) {
  if (selectedCount === 0) return null

  return (
    <div className="card" style={{ display: 'grid', gap: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{selectedCount} selected</strong>
        {working && <span className="muted" style={{ fontSize: 12 }}>Working…</span>}
      </div>

      <div className="stack-sm">
        <label className="muted" style={{ fontSize: 12 }}>Bulk set status</label>
        <div className="row row--wrap">
          <select
            value={bulkStatus}
            onChange={(event) => onBulkStatusChange(event.target.value as Status | '')}
            className="select"
            style={{ width: 'fit-content' }}
          >
            <option value="">Select status</option>
            {STATUSES.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={onApplyBulkStatus}
            disabled={!bulkStatus || working}
            className="button button--primary"
          >
            Apply
          </button>
        </div>
      </div>

      <div className="stack-sm">
        <label className="muted" style={{ fontSize: 12 }}>Bulk add tags</label>
        <TagInput value={bulkTags} onChange={onBulkTagsChange} placeholder="Add tags" />
        <button
          type="button"
          onClick={onApplyBulkTags}
          disabled={bulkTags.length === 0 || working}
          className="button button--primary"
          style={{ width: 'fit-content' }}
        >
          Add tags
        </button>
      </div>
    </div>
  )
}
