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
    <div className="stack-sm">
      <div className="row row--wrap">
        {value.map(tag => (
          <span key={tag} className="chip">
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="chip__close"
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
          className="input"
        />

        {loading ? null : suggestions.length > 0 && (
          <div className="dropdown">
            {suggestions.map(name => (
              <button
                key={name}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addTag(name)}
                className="dropdown__item"
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
