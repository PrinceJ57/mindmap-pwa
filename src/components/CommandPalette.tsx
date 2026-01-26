import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import TagChips from './TagChips'
import { addRecentNode, getRecentNodes, type RecentNode } from '../lib/recentNodes'

type NodeResult = {
  id: number
  title: string
  type: string
  tags?: string[] | null
}

type PaletteItem = {
  id: string
  label: string
  kind: 'command' | 'node'
  nodeId?: number
  nodeType?: string
  tags?: string[]
  action: () => void
}

type Section = {
  title: string
  items: PaletteItem[]
  emptyMessage?: string
}

export type CommandPaletteHandle = {
  open: () => void
}

type CommandPaletteProps = {
  enabled: boolean
}

function normalizeTag(raw: string) {
  return raw.trim().toLowerCase()
}

const CommandPalette = forwardRef<CommandPaletteHandle, CommandPaletteProps>(function CommandPalette(
  { enabled },
  ref,
) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NodeResult[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [recents, setRecents] = useState<RecentNode[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const navigate = useNavigate()

  const openPalette = useCallback(() => {
    if (!enabled) return
    setOpen(true)
  }, [enabled])

  const closePalette = useCallback(() => {
    setOpen(false)
    setQuery('')
    setResults([])
    setLoading(false)
    setErrorMessage(null)
  }, [])

  useImperativeHandle(ref, () => ({ open: openPalette }), [openPalette])

  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return

      const key = event.key.toLowerCase()
      if ((event.metaKey || event.ctrlKey) && key === 'k') {
        event.preventDefault()
        openPalette()
        return
      }

      if (open && key === 'escape') {
        event.preventDefault()
        closePalette()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closePalette, enabled, open, openPalette])

  useEffect(() => {
    if (!open) return
    setSelectedIndex(0)
    setRecents(getRecentNodes())
    const handle = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
    return () => window.clearTimeout(handle)
  }, [open])

  useEffect(() => {
    if (!open) return
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setLoading(false)
      setErrorMessage(null)
      setRecents(getRecentNodes())
      return
    }

    let active = true
    setLoading(true)
    setErrorMessage(null)

    const handle = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc('search_nodes', {
        q: trimmed,
        lim: 20,
        type_filter: null,
        status_filter: null,
        tag_filter: null,
      })

      if (!active) return
      if (error) {
        setResults([])
        setLoading(false)
        setErrorMessage(error.message)
        return
      }

      const normalized = ((data ?? []) as NodeResult[]).map(row => ({
        ...row,
        tags: Array.isArray(row.tags) ? row.tags.map(normalizeTag) : [],
      }))

      setResults(normalized)
      setLoading(false)
    }, 200)

    return () => {
      active = false
      window.clearTimeout(handle)
    }
  }, [open, query])

  const staticCommands = useMemo<PaletteItem[]>(() => [
    {
      id: 'new-idea',
      label: 'New Idea',
      kind: 'command',
      action: () => navigate('/capture?type=idea&status=inbox'),
    },
    {
      id: 'new-task',
      label: 'New Task',
      kind: 'command',
      action: () => navigate('/capture?type=task&status=inbox'),
    },
    {
      id: 'go-home',
      label: 'Go: Home',
      kind: 'command',
      action: () => navigate('/home'),
    },
    {
      id: 'go-board',
      label: 'Go: Board',
      kind: 'command',
      action: () => navigate('/board'),
    },
    {
      id: 'go-outline',
      label: 'Go: Outline',
      kind: 'command',
      action: () => navigate('/outline'),
    },
    {
      id: 'go-review',
      label: 'Go: Review',
      kind: 'command',
      action: () => navigate('/review'),
    },
    {
      id: 'go-import',
      label: 'Go: Import',
      kind: 'command',
      action: () => navigate('/import'),
    },
    {
      id: 'go-search',
      label: 'Go: Search',
      kind: 'command',
      action: () => navigate('/search'),
    },
  ], [navigate])

  const recentItems = useMemo<PaletteItem[]>(
    () =>
      recents.map(item => ({
        id: `recent-${item.id}`,
        label: item.title,
        kind: 'node',
        nodeId: item.id,
        nodeType: item.type,
        tags: item.tags,
        action: () => navigate(`/node/${item.id}`),
      })),
    [navigate, recents],
  )

  const resultItems = useMemo<PaletteItem[]>(
    () =>
      results.map(item => ({
        id: `result-${item.id}`,
        label: item.title,
        kind: 'node',
        nodeId: item.id,
        nodeType: item.type,
        tags: Array.isArray(item.tags) ? item.tags : [],
        action: () => navigate(`/node/${item.id}`),
      })),
    [navigate, results],
  )

  const trimmedQuery = query.trim()

  const sections = useMemo<Section[]>(() => {
    const entries: Section[] = [
      {
        title: 'Commands',
        items: staticCommands,
      },
    ]

    if (!trimmedQuery) {
      entries.push({
        title: 'Recent',
        items: recentItems,
        emptyMessage: 'No recent nodes yet.',
      })
    } else {
      entries.push({
        title: 'Open node…',
        items: resultItems,
        emptyMessage: loading ? 'Searching…' : errorMessage ? 'Search failed.' : 'No matching nodes.',
      })
    }

    return entries
  }, [errorMessage, loading, recentItems, resultItems, staticCommands, trimmedQuery])

  const selectableItems = useMemo(
    () => sections.flatMap(section => section.items),
    [sections],
  )

  useEffect(() => {
    if (selectedIndex >= selectableItems.length) {
      setSelectedIndex(0)
    }
  }, [selectableItems.length, selectedIndex])

  const runItem = useCallback(
    (item: PaletteItem | undefined) => {
      if (!item) return
      if (item.kind === 'node' && item.nodeId) {
        addRecentNode({
          id: item.nodeId,
          title: item.label,
          type: item.nodeType ?? 'idea',
          tags: item.tags ?? [],
        })
      }
      closePalette()
      item.action()
    },
    [closePalette],
  )

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex(prev => (selectableItems.length === 0 ? 0 : (prev + 1) % selectableItems.length))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex(prev => {
          if (selectableItems.length === 0) return 0
          return (prev - 1 + selectableItems.length) % selectableItems.length
        })
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        runItem(selectableItems[selectedIndex])
      }
    },
    [runItem, selectableItems, selectedIndex],
  )

  if (!enabled || !open) return null

  let itemIndex = -1

  return (
    <div className="modalOverlay" onClick={closePalette}>
      <div className="modalPanel palettePanel" onClick={(event) => event.stopPropagation()}>
        <div className="paletteHeader">
          <h3 id="command-palette-title">Command Palette</h3>
          <span className="chip chip--compact">Esc</span>
        </div>

        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            const nextValue = event.target.value
            setQuery(nextValue)
            setSelectedIndex(0)
            if (nextValue.trim()) {
              setResults([])
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type to search nodes…"
          className="input paletteInput"
          aria-label="Command palette search"
        />

        <div className="paletteList" role="listbox" aria-labelledby="command-palette-title">
          {sections.map(section => (
            <div key={section.title} className="paletteSection">
              <div className="paletteSectionTitle">{section.title}</div>
              {section.items.length === 0 ? (
                <div className="paletteEmpty">{section.emptyMessage}</div>
              ) : (
                section.items.map(item => {
                  itemIndex += 1
                  const isActive = itemIndex === selectedIndex
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={`paletteItem${isActive ? ' paletteItem--active' : ''}`}
                      onMouseEnter={() => setSelectedIndex(itemIndex)}
                      onClick={() => runItem(item)}
                    >
                      <div className="paletteItemRow">
                        <span className="paletteItemLabel">{item.label}</span>
                        {item.kind === 'node' && item.nodeType && (
                          <span className="chip chip--compact">{item.nodeType}</span>
                        )}
                      </div>
                      {item.tags && item.tags.length > 0 && (
                        <TagChips tags={item.tags} compact />
                      )}
                    </button>
                  )
                })
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
})

export default CommandPalette
