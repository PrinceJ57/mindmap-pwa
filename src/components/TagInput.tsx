import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { supabase } from '../supabaseClient'

type TagInputProps = {
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}

function normalizeTag(raw: string) {
  return raw.trim().toLowerCase()
}

export default function TagInput({ value, onChange, placeholder }: TagInputProps) {
  const [input, setInput] = useState('')
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true

    async function loadTags() {
      setLoading(true)
      const { data, error } = await supabase
        .from('tags')
        .select('name')
        .order('name', { ascending: true })

      if (!active) return
      setLoading(false)

      if (error) return
      const names = (data ?? [])
        .map(row => normalizeTag(row.name))
        .filter(Boolean)
      setAvailableTags(Array.from(new Set(names)))
    }

    loadTags()
    return () => { active = false }
  }, [])

  const suggestions = useMemo(() => {
    const prefix = normalizeTag(input)
    if (!prefix) return []
    return availableTags
      .filter(name => name.startsWith(prefix) && !value.includes(name))
      .slice(0, 8)
  }, [availableTags, input, value])

  function addTag(raw: string) {
    const tag = normalizeTag(raw)
    if (!tag) return
    if (value.includes(tag)) {
      setInput('')
      return
    }
    onChange([...value, tag])
    setInput('')
  }

  function removeTag(tag: string) {
    onChange(value.filter(t => t !== tag))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      addTag(input)
      return
    }

    if (event.key === 'Backspace' && !input && value.length > 0) {
      event.preventDefault()
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {value.map(tag => (
          <span
            key={tag}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              borderRadius: 999,
              background: '#222',
              color: '#fff',
              fontSize: 12,
            }}
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'inherit',
                cursor: 'pointer',
                fontSize: 14,
                lineHeight: 1,
              }}
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <div style={{ position: 'relative' }}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? 'Add tag'}
          style={{ width: '100%', padding: 12, fontSize: 16 }}
        />

        {loading ? null : suggestions.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              background: '#111',
              border: '1px solid #333',
              borderRadius: 8,
              marginTop: 6,
              zIndex: 10,
              overflow: 'hidden',
            }}
          >
            {suggestions.map(name => (
              <button
                key={name}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addTag(name)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 12px',
                  background: 'transparent',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
