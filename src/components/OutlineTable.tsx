import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import TagChips from './TagChips'

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

type OutlineTableProps = {
  rows: NodeRow[]
  selectedIds: Set<number>
  onToggleRow: (id: number) => void
  onToggleAll: () => void
  onTagClick: (tag: string) => void
}

export default function OutlineTable({
  rows,
  selectedIds,
  onToggleRow,
  onToggleAll,
  onTagClick,
}: OutlineTableProps) {
  const headerCheckboxRef = useRef<HTMLInputElement | null>(null)
  const allSelected = rows.length > 0 && rows.every(row => selectedIds.has(row.id))
  const selectedCount = selectedIds.size

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = selectedCount > 0 && !allSelected
    }
  }, [selectedCount, allSelected])

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 720, display: 'grid', gap: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '36px 1.6fr 90px 110px 1fr', gap: 12, padding: '8px 4px', borderBottom: '1px solid var(--border)', fontSize: 12 }} className="muted">
          <input
            ref={headerCheckboxRef}
            type="checkbox"
            checked={allSelected}
            onChange={onToggleAll}
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
            style={{ display: 'grid', gridTemplateColumns: '36px 1.6fr 90px 110px 1fr', gap: 12, padding: '10px 4px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}
          >
            <input
              type="checkbox"
              checked={selectedIds.has(row.id)}
              onChange={() => onToggleRow(row.id)}
              aria-label={`Select ${row.title}`}
            />
            <div style={{ display: 'grid', gap: 4 }}>
              <Link to={`/node/${row.id}`}>
                <strong style={{ fontSize: 14 }}>{row.title}</strong>
              </Link>
              {row.body && (
                <span className="muted" style={{ fontSize: 12 }}>
                  {row.body.slice(0, 120)}{row.body.length > 120 ? '…' : ''}
                </span>
              )}
              <span className="muted" style={{ fontSize: 11 }}>
                {new Date(row.created_at).toLocaleDateString()}
              </span>
            </div>
            <span className="muted" style={{ fontSize: 12 }}>{row.type}</span>
            <span className="muted" style={{ fontSize: 12 }}>{row.status}</span>
            <TagChips tags={row.tags ?? []} onTagClick={onTagClick} compact />
          </div>
        ))}
      </div>
    </div>
  )
}

export type { NodeRow }
