import React from 'react'

type TagChipsProps = {
  tags?: string[] | null
  onTagClick?: (tag: string) => void
  compact?: boolean
}

export default function TagChips({ tags, onTagClick, compact }: TagChipsProps) {
  if (!tags || tags.length === 0) return null

  return (
    <div className="row row--wrap">
      {tags.map(tag => {
        const className = `chip${compact ? ' chip--compact' : ''}${onTagClick ? ' chip--clickable' : ''}`
        if (onTagClick) {
          return (
            <button
              key={tag}
              type="button"
              onClick={() => onTagClick(tag)}
              className={className}
            >
              {tag}
            </button>
          )
        }

        return (
          <span key={tag} className={className}>
            {tag}
          </span>
        )
      })}
    </div>
  )
}
