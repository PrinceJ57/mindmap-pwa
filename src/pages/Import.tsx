import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import TagInput from '../components/TagInput'
import TagChips from '../components/TagChips'
import { supabase } from '../supabaseClient'
import { createNodeWithTags, type NodeWritePayload } from '../lib/nodeWrites'
import { extractInlineTags, mergeTags, normalizeTag } from '../lib/tagParse'
import { errorToString, type SaveNodeError } from '../offlineQueue'

type SourceChoice = 'bear' | 'notes' | 'other'

type ImportItem = {
  id: string
  sourceLabel: string
  rowIndex?: number
  title: string
  body: string
  extractedTags: string[]
  type: 'idea' | 'task'
  status: string
  state: 'pending' | 'success' | 'error'
  error?: string
}

type ImportSummary = {
  total: number
  success: number
  failed: number
  errors: { id: string; title: string; message: string }[]
}

const DEFAULT_STATUS = 'someday'
const CONCURRENCY = 3

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function getExtension(name: string): string {
  const parts = name.split('.')
  if (parts.length < 2) return ''
  return parts[parts.length - 1].toLowerCase()
}

function inferTitleFromMarkdown(text: string, fallback: string): string {
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('##')) continue
    if (trimmed.startsWith('# ')) {
      return trimmed.slice(2).trim().slice(0, 80) || fallback
    }
  }
  return inferTitleFromText(text, fallback)
}

function inferTitleFromText(text: string, fallback: string): string {
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    return trimmed.slice(0, 80) || fallback
  }
  return fallback
}

function stripExtension(name: string): string {
  const parts = name.split('.')
  if (parts.length < 2) return name
  parts.pop()
  return parts.join('.') || name
}

function getSnippet(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned) return ''
  return cleaned.slice(0, 200)
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          current += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }

    if (char === ',') {
      row.push(current)
      current = ''
      continue
    }

    if (char === '\n') {
      row.push(current)
      rows.push(row)
      row = []
      current = ''
      continue
    }

    if (char === '\r') {
      if (text[i + 1] === '\n') {
        i += 1
      }
      row.push(current)
      rows.push(row)
      row = []
      current = ''
      continue
    }

    current += char
  }

  row.push(current)
  rows.push(row)

  return rows
    .map((columns) => columns.map((column) => column.trim()))
    .filter((columns) => columns.some((column) => column.length > 0))
}

function parseCsvRows(text: string, sourceLabel: string): { items: ImportItem[]; errors: string[] } {
  const rows = parseCsv(text)
  if (rows.length === 0) return { items: [], errors: ['CSV is empty.'] }
  const header = rows[0].map((value, index) => {
    const cleaned = index === 0 ? value.replace(/^\uFEFF/, '') : value
    return cleaned.toLowerCase()
  })

  const colIndex = (name: string) => header.findIndex((col) => col === name)
  const titleIndex = colIndex('title')
  const bodyIndex = colIndex('body')
  const tagsIndex = colIndex('tags')
  const typeIndex = colIndex('type')
  const statusIndex = colIndex('status')

  if ([titleIndex, bodyIndex, tagsIndex, typeIndex, statusIndex].every((idx) => idx === -1)) {
    return { items: [], errors: ['CSV header must include at least one of: title, body, tags, type, status.'] }
  }

  const items: ImportItem[] = []

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i]
    if (row.every((cell) => !cell)) continue

    const rawTitle = titleIndex >= 0 ? row[titleIndex] : ''
    const rawBody = bodyIndex >= 0 ? row[bodyIndex] : ''
    const rawTags = tagsIndex >= 0 ? row[tagsIndex] : ''
    const rawType = typeIndex >= 0 ? row[typeIndex] : ''
    const rawStatus = statusIndex >= 0 ? row[statusIndex] : ''

    const titleFallback = rawBody ? inferTitleFromText(rawBody, `Row ${i}`) : `Row ${i}`
    const title = rawTitle ? rawTitle.slice(0, 80) : titleFallback

    const extractedTags = rawTags
      ? rawTags
          .split(',')
          .map((tag) => normalizeTag(tag))
          .filter(Boolean)
      : []

    const normalizedType = normalizeTag(rawType)
    const type = normalizedType === 'task' ? 'task' : 'idea'
    const status = rawStatus ? rawStatus : DEFAULT_STATUS

    items.push({
      id: generateId(),
      sourceLabel,
      rowIndex: i,
      title,
      body: rawBody,
      extractedTags,
      type,
      status,
      state: 'pending',
    })
  }

  return { items, errors: [] }
}

export default function Import() {
  const [sourceChoice, setSourceChoice] = useState<SourceChoice>('bear')
  const [customSource, setCustomSource] = useState('')
  const [tags, setTags] = useState<string[]>(['imported', 'bear'])
  const [items, setItems] = useState<ImportItem[]>([])
  const [fileErrors, setFileErrors] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [completed, setCompleted] = useState(0)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const prevSourceRef = useRef('bear')

  const sourceTag = useMemo(() => {
    if (sourceChoice === 'other') return normalizeTag(customSource)
    return sourceChoice
  }, [sourceChoice, customSource])

  useEffect(() => {
    const previous = prevSourceRef.current
    const nextSource = sourceTag
    setTags((prev) => {
      const trimmed = prev.filter((tag) => tag && tag !== previous)
      return mergeTags(trimmed, ['imported', nextSource].filter(Boolean))
    })
    prevSourceRef.current = nextSource
  }, [sourceTag])

  const totalCount = items.length
  const progress = totalCount === 0 ? 0 : Math.round((completed / totalCount) * 100)

  async function handleFiles(list: FileList | File[]) {
    const files = Array.from(list)
    if (files.length === 0) return

    const nextItems: ImportItem[] = []
    const errors: string[] = []

    for (const file of files) {
      const ext = getExtension(file.name)
      if (!['md', 'txt', 'csv'].includes(ext)) {
        errors.push(`${file.name}: Unsupported file type.`)
        continue
      }

      let text = ''
      try {
        text = await file.text()
      } catch (error) {
        errors.push(`${file.name}: ${errorToString(error)}`)
        continue
      }

      const label = file.name

      if (ext === 'csv') {
        const result = parseCsvRows(text, label)
        nextItems.push(...result.items)
        errors.push(...result.errors.map((message) => `${file.name}: ${message}`))
        continue
      }

      const fallback = stripExtension(file.name)
      const title = ext === 'md'
        ? inferTitleFromMarkdown(text, fallback)
        : inferTitleFromText(text, fallback)

      const extractedTags = extractInlineTags(text)

      nextItems.push({
        id: generateId(),
        sourceLabel: label,
        title,
        body: text,
        extractedTags,
        type: 'idea',
        status: DEFAULT_STATUS,
        state: 'pending',
      })
    }

    setItems((prev) => [...prev, ...nextItems])
    setFileErrors((prev) => [...prev, ...errors])
    setSummary(null)
    setCompleted(0)
  }

  async function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    if (!event.target.files) return
    await handleFiles(event.target.files)
    event.target.value = ''
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    void handleFiles(event.dataTransfer.files)
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
  }

  function resetAll() {
    setItems([])
    setFileErrors([])
    setSummary(null)
    setCompleted(0)
  }

  async function runImport() {
    if (importing) return
    if (!sourceTag) return alert('Pick a source tag before importing.')
    if (items.length === 0) return alert('Add files to import.')

    const session = (await supabase.auth.getSession()).data.session
    if (!session) return alert('Not signed in.')

    setImporting(true)
    setCompleted(0)
    setSummary(null)

    const working: ImportItem[] = items.map((item) => ({ ...item, state: 'pending', error: undefined }))
    setItems(working)

    let success = 0
    let failed = 0
    const errors: { id: string; title: string; message: string }[] = []

    let index = 0
    let inFlight = 0

    await new Promise<void>((resolve) => {
      const launchNext = () => {
        if (index >= working.length && inFlight === 0) {
          resolve()
          return
        }

        while (inFlight < CONCURRENCY && index < working.length) {
          const current = working[index]
          index += 1
          inFlight += 1

          const payload: NodeWritePayload = {
            type: current.type,
            title: current.title,
            body: current.body,
            tags: mergeTags(tags, current.extractedTags, ['imported', sourceTag].filter(Boolean)),
            status: current.status || DEFAULT_STATUS,
            context: null,
            energy: null,
            duration_minutes: null,
            due_at: null,
          }

          createNodeWithTags({
            supabase,
            userId: session.user.id,
            payload,
            allowPartialTags: false,
          })
            .then(() => {
              success += 1
              setItems((prev) =>
                prev.map((item) =>
                  item.id === current.id ? { ...item, state: 'success' } : item
                )
              )
            })
            .catch((error: SaveNodeError) => {
              const message = errorToString(error)
              failed += 1
              errors.push({ id: current.id, title: current.title, message })
              setItems((prev) =>
                prev.map((item) =>
                  item.id === current.id ? { ...item, state: 'error', error: message } : item
                )
              )
            })
            .finally(() => {
              inFlight -= 1
              setCompleted((prev) => prev + 1)
              launchNext()
            })
        }
      }

      launchNext()
    })

    setImporting(false)
    setSummary({ total: working.length, success, failed, errors })
  }

  return (
    <div className="stack">
      <div className="row row--wrap">
        <h2>Import</h2>
        <span className="badge">Desktop-focused</span>
      </div>

      <section className="card stack-sm">
        <div className="stack-sm">
          <label className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Source</label>
          <div className="row row--wrap">
            <select
              value={sourceChoice}
              onChange={(event) => setSourceChoice(event.target.value as SourceChoice)}
              className="select"
              style={{ minWidth: 160 }}
            >
              <option value="bear">bear</option>
              <option value="notes">notes</option>
              <option value="other">other</option>
            </select>
            {sourceChoice === 'other' && (
              <input
                value={customSource}
                onChange={(event) => setCustomSource(event.target.value)}
                placeholder="custom source tag"
                className="input"
                style={{ minWidth: 220 }}
              />
            )}
          </div>
        </div>

        <div className="stack-sm">
          <label className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Default tags</label>
          <TagInput value={tags} onChange={setTags} placeholder="Add tags" />
        </div>

        <div className="stack-sm">
          <label className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Default status</label>
          <div className="preview">{DEFAULT_STATUS}</div>
        </div>
      </section>

      <section className="card stack-sm" style={{ borderStyle: 'dashed' }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Drop files here</div>
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="preview"
          style={{ textAlign: 'center' }}
        >
          Drag .md, .txt, or .csv files here
        </div>
        <input
          type="file"
          accept=".md,.txt,.csv"
          multiple
          onChange={handleFileInput}
          className="input"
        />
        {fileErrors.length > 0 && (
          <div style={{ color: '#f87171', fontSize: 13 }}>
            {fileErrors.map((error, index) => (
              <div key={`${error}-${index}`}>{error}</div>
            ))}
          </div>
        )}
      </section>

      <section className="stack-sm">
        <div className="row">
          <h3>Preview ({items.length})</h3>
          {items.length > 0 && (
            <button onClick={resetAll} type="button" className="button button--ghost">
              Clear list
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <div className="preview">
            Add files to see a preview.
          </div>
        ) : (
          <div className="stack-sm">
            {items.map((item) => (
              <div
                key={item.id}
                className="card"
                style={{
                  borderColor: item.state === 'error' ? 'rgba(248, 113, 113, 0.6)' : 'var(--border)',
                  background: item.state === 'error' ? 'rgba(248, 113, 113, 0.12)' : 'var(--panel)',
                }}
              >
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{item.title || 'Untitled'}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {item.sourceLabel}
                      {typeof item.rowIndex === 'number' ? ` · row ${item.rowIndex}` : ''}
                    </div>
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>{item.state}</div>
                </div>
                <div className="preview" style={{ marginTop: 8 }}>{getSnippet(item.body)}</div>
                {item.extractedTags.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <TagChips tags={item.extractedTags} compact />
                  </div>
                )}
                {item.error && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#f87171' }}>{item.error}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card stack-sm">
        <div className="row row--wrap">
          <button
            onClick={() => void runImport()}
            disabled={importing || items.length === 0}
            className="button button--primary"
          >
            {importing ? 'Importing...' : 'Import'}
          </button>
          <div style={{ minWidth: 200 }}>
            <progress value={completed} max={items.length || 1} style={{ width: '100%' }} />
          </div>
          <div className="muted" style={{ fontSize: 12 }}>{progress}%</div>
        </div>

        {summary && (
          <div className="stack-sm">
            <div>Imported {summary.success} of {summary.total}. Failed: {summary.failed}.</div>
            {summary.errors.length > 0 && (
              <div style={{ color: '#f87171', fontSize: 12 }}>
                {summary.errors.map((error) => (
                  <div key={error.id}>{error.title}: {error.message}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
