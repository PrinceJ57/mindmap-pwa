import React from 'react'

type TagChipsProps = {
  tags?: string[] | null
  onTagClick?: (tag: string) => void
  compact?: boolean
}

export default function TagChips({ tags, onTagClick, compact }: TagChipsProps) {
  if (!tags || tags.length === 0) return null

  const baseStyle: React.CSSProperties = {
    padding: compact ? '2px 6px' : '4px 8px',
    borderRadius: 999,
    border: '1px solid #333',
    background: '#111',
    color: '#fff',
    fontSize: compact ? 10 : 11,
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {tags.map(tag => {
        if (onTagClick) {
          return (
            <button
              key={tag}
              type="button"
              onClick={() => onTagClick(tag)}
              style={{ ...baseStyle, cursor: 'pointer' }}
            >
              {tag}
            </button>
          )
        }

        return (
          <span key={tag} style={baseStyle}>
            {tag}
          </span>
        )
      })}
    </div>
  )
}
