import TagInput from './TagInput'
import { STATUSES, type Status } from '../utils/status'
import type { ViewSort } from '../utils/viewFilters'

type TypeFilter = 'all' | 'idea' | 'task'

type OutlineFiltersProps = {
  q: string
  onQChange: (value: string) => void
  typeFilter: TypeFilter
  onTypeFilterChange: (value: TypeFilter) => void
  statusFilter: Status[]
  onStatusFilterChange: (value: Status[]) => void
  tagFilter: string[]
  onTagFilterChange: (value: string[]) => void
  pinnedOnly: boolean
  onPinnedOnlyChange: (value: boolean) => void
  sort: ViewSort
  onSortChange: (value: ViewSort) => void
  hasFilters: boolean
  onClearFilters: () => void
}

export default function OutlineFilters({
  q,
  onQChange,
  typeFilter,
  onTypeFilterChange,
  statusFilter,
  onStatusFilterChange,
  tagFilter,
  onTagFilterChange,
  pinnedOnly,
  onPinnedOnlyChange,
  sort,
  onSortChange,
  hasFilters,
  onClearFilters,
}: OutlineFiltersProps) {
  function toggleStatus(status: Status) {
    if (statusFilter.includes(status)) {
      onStatusFilterChange(statusFilter.filter(item => item !== status))
    } else {
      onStatusFilterChange([...statusFilter, status])
    }
  }

  return (
    <div className="stack-sm">
      <input
        value={q}
        onChange={(event) => onQChange(event.target.value)}
        placeholder="Search title/body…"
        className="input"
      />

      <div className="row row--wrap">
        {(['all', 'idea', 'task'] as TypeFilter[]).map(option => (
          <button
            key={option}
            onClick={() => onTypeFilterChange(option)}
            disabled={typeFilter === option}
            className={`button ${typeFilter === option ? 'button--primary' : 'button--ghost'}`}
          >
            {option === 'all' ? 'All' : option === 'idea' ? 'Ideas' : 'Tasks'}
          </button>
        ))}
      </div>

      <div className="stack-sm">
        <label className="muted" style={{ fontSize: 12 }}>Statuses</label>
        <div className="row row--wrap">
          {STATUSES.map(status => (
            <button
              key={status}
              type="button"
              onClick={() => toggleStatus(status)}
              className={`chip chip--clickable${statusFilter.includes(status) ? ' chip--selected' : ''}`}
            >
              {status}
            </button>
          ))}
          {statusFilter.length > 0 && (
            <button type="button" onClick={() => onStatusFilterChange([])} className="button button--ghost">
              Clear statuses
            </button>
          )}
        </div>
      </div>

      <TagInput value={tagFilter} onChange={onTagFilterChange} placeholder="Filter tags" />

      <label className="row" style={{ fontSize: 12 }}>
        <input
          type="checkbox"
          checked={pinnedOnly}
          onChange={(event) => onPinnedOnlyChange(event.target.checked)}
        />
        Pinned only
      </label>

      <div className="stack-sm">
        <label className="muted" style={{ fontSize: 12 }}>Sort</label>
        <select
          value={sort}
          onChange={(event) => onSortChange(event.target.value as ViewSort)}
          className="select"
          style={{ width: 'fit-content' }}
        >
          <option value="updated">Updated</option>
          <option value="created">Created</option>
          <option value="relevance">Relevance</option>
        </select>
      </div>

      {hasFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="button button--ghost"
          style={{ width: 'fit-content' }}
        >
          Clear filters
        </button>
      )}
    </div>
  )
}

export type { TypeFilter }
