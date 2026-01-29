import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TagChips from '../components/TagChips'
import { supabase } from '../supabaseClient'
import { enqueuePayload, errorToString, getQueueCount, onQueueUpdate, shouldQueueError, syncOfflineQueue, type SaveNodeError } from '../offlineQueue'
import { createNodeWithTags, type NodeWritePayload } from '../lib/nodeWrites'
import { parseQuickAdd } from '../lib/quickAddParse'
import { CAPTURE_PREFILL_STORAGE_KEY, parsePrefillParams } from '../lib/queryPrefill'
import { STATUSES } from '../utils/status'

type SaveMessage = { tone: 'success' | 'offline' | 'error'; text: string }

type RecentRow = {
  id: number
  title: string
  type: string
  status: string
  created_at: string
  updated_at?: string | null
  pinned?: boolean | null
  tags?: string[] | null
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const INSTALL_DISMISS_KEY = 'mm_install_hint_dismissed'
const CAPTURE_LINK_COPIED_KEY = 'mm_capture_link_copied'

const CAPTURE_TEMPLATES = [
  { label: 'Task', token: 'type:task !active ' },
  { label: 'Idea', token: 'type:idea ' },
  { label: 'Note', token: 'type:idea ' },
  { label: 'Waiting', token: '!waiting ' },
  { label: 'Someday', token: '!someday ' },
] as const

function tokenize(input: string) {
  return input.trim().split(/\s+/).filter(Boolean)
}

function normalizeTokenValue(raw: string) {
  return raw.trim().replace(/[.,;:!?]+$/g, '')
}

function isValidDueDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function splitInput(raw: string) {
  const parts = raw.split(/\r?\n/)
  const headline = parts[0] ?? ''
  const body = parts.slice(1).join('\n').trim()
  return { headline, body }
}

function looksLikeBareDomain(value: string) {
  if (!value) return false
  if (value.startsWith('http://') || value.startsWith('https://')) return false
  if (value.includes(' ')) return false
  return /^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+([/?#][^\s]*)?$/i.test(value)
}

function normalizeSharedText(input: string) {
  const { headline, body } = splitInput(input)
  const trimmedHeadline = headline.trim()
  if (looksLikeBareDomain(trimmedHeadline)) {
    const nextHeadline = `https://${trimmedHeadline}`
    return body ? `${nextHeadline}\n${body}` : nextHeadline
  }
  return input
}

function ensureSharedTag(input: string) {
  const { headline, body } = splitInput(input)
  const hasTag = /(^|\s)#shared_ios(\s|$)/i.test(headline)
  if (hasTag) return input
  const nextHeadline = headline.trim() ? `${headline.trim()} #shared_ios` : '#shared_ios'
  return body ? `${nextHeadline}\n${body}` : nextHeadline
}

function buildPrefillInput() {
  const search = window.location.search
  const rawParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const source = rawParams.get('source') ?? ''
  const isShared = source === 'ios_share'
  const autosave = rawParams.get('autosave') === '1'
  const textParam = rawParams.get('text')
  if (textParam && textParam.trim()) {
    let decoded = textParam.replace(/\+/g, ' ')
    if (isShared) {
      decoded = normalizeSharedText(decoded)
      decoded = ensureSharedTag(decoded)
    }
    window.sessionStorage.removeItem(CAPTURE_PREFILL_STORAGE_KEY)
    if (search) {
      const next = window.location.pathname + window.location.hash
      window.history.replaceState(null, '', next)
    }
    return { text: decoded, prefilled: true, autosave, isShared }
  }
  let prefill = parsePrefillParams(search)

  if (!prefill.hasPrefill) {
    const stored = window.sessionStorage.getItem(CAPTURE_PREFILL_STORAGE_KEY)
    if (stored) {
      prefill = parsePrefillParams(stored)
      if (!prefill.hasPrefill) {
        window.sessionStorage.removeItem(CAPTURE_PREFILL_STORAGE_KEY)
      }
    }
  }

  if (!prefill.hasPrefill) return { text: '', prefilled: false, autosave: false, isShared: false }

  const baseTags = isShared
    ? prefill.tags.filter(tag => tag !== 'dictated')
    : prefill.tags
  const tags = isShared
    ? (baseTags.includes('shared_ios') ? baseTags : [...baseTags, 'shared_ios'])
    : baseTags

  const tokens: string[] = []
  if (prefill.title) tokens.push(prefill.title)
  if (prefill.context) tokens.push(`@${prefill.context}`)
  if (prefill.status) tokens.push(`!${prefill.status}`)
  if (prefill.type) tokens.push(`type:${prefill.type}`)
  if (tags.length > 0) {
    tokens.push(...tags.map(tag => `#${tag}`))
  }

  const headline = tokens.join(' ').trim()
  const body = prefill.body.trim()
  const text = body ? `${headline}\n${body}`.trim() : headline

  window.sessionStorage.removeItem(CAPTURE_PREFILL_STORAGE_KEY)
  if (search) {
    const next = window.location.pathname + window.location.hash
    window.history.replaceState(null, '', next)
  }

  return { text, prefilled: true, autosave, isShared }
}

function buildCaptureUrl(options: {
  title: string
  body: string
  tags: string[]
  context?: string
  status?: string
  type?: string
}) {
  const url = new URL('/capture', window.location.origin)
  if (options.title) url.searchParams.set('title', options.title)
  if (options.body) url.searchParams.set('body', options.body)
  if (options.tags.length > 0) url.searchParams.set('tags', options.tags.join(','))
  if (options.context) url.searchParams.set('context', options.context)
  if (options.status) url.searchParams.set('status', options.status)
  if (options.type) url.searchParams.set('type', options.type)
  return url.toString()
}

function extractFirstUrl(text: string) {
  const match = text.match(/https?:\/\/[^\s]+/i)
    ?? text.match(/www\.[^\s]+/i)
    ?? text.match(/(^|[\s(])((?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?)/i)
  if (!match) return null
  const raw = match[2] ?? match[0]
  const withScheme = raw.startsWith('http') ? raw : `https://${raw}`
  try {
    return new URL(withScheme)
  } catch {
    return null
  }
}

function domainTagFromHost(host: string) {
  const cleaned = host.replace(/^www\./i, '').toLowerCase()
  const parts = cleaned.split('.')
  if (parts.length >= 2) return parts[0]
  return cleaned
}

export default function Capture() {
  const [rawInput, setRawInput] = useState('')
  const [saveMessage, setSaveMessage] = useState<SaveMessage | null>(null)
  const [saving, setSaving] = useState(false)
  const [prefilled, setPrefilled] = useState(false)
  const [autosaveRequested, setAutosaveRequested] = useState(false)
  const [sharePrefill, setSharePrefill] = useState(false)
  const [queueCount, setQueueCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [recent, setRecent] = useState<RecentRow[]>([])
  const [recentLoading, setRecentLoading] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installDismissed, setInstallDismissed] = useState(false)
  const [online, setOnline] = useState(true)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const autosaveOnceRef = useRef(false)
  const autoTitleRef = useRef(false)
  const navigate = useNavigate()

  const { headline, body } = useMemo(() => splitInput(rawInput), [rawInput])
  const parsed = useMemo(() => parseQuickAdd(headline), [headline])
  const linkInfo = useMemo(() => {
    const url = extractFirstUrl(rawInput)
    if (!url) return null
    const hostname = url.hostname
    const domainTag = domainTagFromHost(hostname)
    const path = url.pathname && url.pathname !== '/' ? url.pathname.replace(/\/$/, '') : ''
    const suggestedTitle = path ? `${hostname} — ${path}` : hostname
    return {
      url: url.toString(),
      hostname,
      domainTag,
      suggestedTitle,
    }
  }, [rawInput])

  const validation = useMemo(() => {
    const tokens = tokenize(headline)
    const errors: string[] = []
    const warnings: string[] = []

    if (!parsed.title.trim()) {
      errors.push('Title required.')
    }

    const invalidDueTokens = tokens
      .filter(token => token.toLowerCase().startsWith('due:'))
      .map(token => normalizeTokenValue(token.slice(4)))
      .filter(value => !value || !isValidDueDate(value))

    if (invalidDueTokens.length > 0) {
      errors.push(`Invalid due date: ${invalidDueTokens.join(', ')}`)
    }

    const invalidTypeTokens = tokens
      .filter(token => token.toLowerCase().startsWith('type:'))
      .map(token => normalizeTokenValue(token.slice(5)).toLowerCase())
      .filter(value => value && value !== 'idea' && value !== 'task')

    if (invalidTypeTokens.length > 0) {
      warnings.push(`Unknown type ignored: ${invalidTypeTokens.join(', ')}`)
    }

    const invalidStatusTokens = tokens
      .filter(token => token.startsWith('!'))
      .map(token => normalizeTokenValue(token.slice(1)).toLowerCase())
      .filter(value => value && !(STATUSES as readonly string[]).includes(value))

    if (invalidStatusTokens.length > 0) {
      warnings.push(`Unknown status ignored: ${invalidStatusTokens.join(', ')}`)
    }

    const titleTokens = tokens.filter(token => token.toLowerCase().startsWith('title:'))
    if (titleTokens.length > 0) {
      const hasTitleValue = titleTokens.some(token => normalizeTokenValue(token.slice(6)))
      if (!hasTitleValue) warnings.push('title: token needs text')
    }

    return { errors, warnings }
  }, [headline, parsed.title])

  const canSubmit = validation.errors.length === 0 && parsed.title.trim() !== '' && !saving
  const suggestedTags = useMemo(() => {
    if (!linkInfo) return []
    const tags = ['link', linkInfo.domainTag]
    return tags.filter(tag => tag && !parsed.tags.includes(tag))
  }, [linkInfo, parsed.tags])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem(INSTALL_DISMISS_KEY)
    if (!stored) return
    const lastDismissed = Number(stored)
    if (!Number.isNaN(lastDismissed) && Date.now() - lastDismissed < 7 * 24 * 60 * 60 * 1000) {
      setInstallDismissed(true)
    }
  }, [])

  useEffect(() => {
    const handler = (event: Event) => {
      const promptEvent = event as BeforeInstallPromptEvent
      promptEvent.preventDefault()
      setInstallPrompt(promptEvent)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    const updateQueue = () => setQueueCount(getQueueCount())
    updateQueue()
    return onQueueUpdate(updateQueue)
  }, [])

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine)
    updateOnline()
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [])

  useEffect(() => {
    const { text, prefilled, autosave, isShared } = buildPrefillInput()
    if (prefilled && text) {
      setRawInput(text)
      setPrefilled(true)
    }
    setAutosaveRequested(autosave)
    setSharePrefill(isShared)
    autosaveOnceRef.current = false
    autoTitleRef.current = false
  }, [])

  useEffect(() => {
    if (!sharePrefill) return
    if (autoTitleRef.current) return
    if (parsed.title.trim()) return
    const fallbackLine = body.split(/\r?\n/)[0]?.trim() ?? ''
    const candidate = linkInfo?.suggestedTitle ?? fallbackLine
    if (!candidate) return
    autoTitleRef.current = true
    setRawInput(prev => {
      const { headline, body } = splitInput(prev)
      const trimmedHeadline = headline.trim()
      const nextHeadline = trimmedHeadline ? `${candidate} ${trimmedHeadline}` : candidate
      return body ? `${nextHeadline}\n${body}` : nextHeadline
    })
  }, [sharePrefill, parsed.title, linkInfo, body])

  useEffect(() => {
    if (!autosaveRequested) return
    if (autosaveOnceRef.current) return
    if (!canSubmit) return
    autosaveOnceRef.current = true
    void handleSave()
  }, [autosaveRequested, canSubmit])

  const loadRecent = useCallback(async () => {
    setRecentLoading(true)
    const { data, error } = await supabase.rpc('list_nodes', {
      lim: 20,
      q: null,
      type_filter: null,
      status_filter: null,
      tag_filter: null,
      pinned_only: false,
      review_due_only: false,
    })

    if (error) {
      setRecent([])
      setRecentLoading(false)
      return
    }

    const rows = (data ?? []) as RecentRow[]
    setRecent(rows)
    setRecentLoading(false)
  }, [])

  useEffect(() => {
    void loadRecent()
  }, [loadRecent])

  const dismissInstallHint = () => {
    localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()))
    setInstallDismissed(true)
  }

  const isStandalone = typeof window !== 'undefined'
    && (window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone)

  const isIos = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
  const showInstallHint = !installDismissed && !isStandalone && (installPrompt || isIos)

  async function runSync() {
    if (syncing || queueCount === 0) return
    setSyncing(true)
    try {
      await syncOfflineQueue({ supabase, maxItems: 10 })
    } finally {
      setSyncing(false)
      setQueueCount(getQueueCount())
    }
  }

  async function handleSave() {
    if (!canSubmit) {
      setSaveMessage({ tone: 'error', text: 'Fix the Quick Add errors before saving.' })
      return
    }

    setSaving(true)
    setSaveMessage(null)

    const session = (await supabase.auth.getSession()).data.session
    if (!session) {
      setSaving(false)
      setSaveMessage({ tone: 'error', text: 'Not signed in.' })
      return
    }

    const payload: NodeWritePayload = {
      type: parsed.type ?? 'idea',
      title: parsed.title.trim(),
      body: body,
      tags: parsed.tags,
      status: parsed.status ?? 'inbox',
      context: parsed.context ? parsed.context : null,
      energy: null,
      duration_minutes: null,
      due_at: parsed.due_at ?? null,
    }

    try {
      await createNodeWithTags({
        supabase,
        userId: session.user.id,
        payload,
        allowPartialTags: false,
      })

      setRawInput('')
      setSaveMessage({ tone: 'success', text: 'Saved ✅' })
      void loadRecent()
    } catch (error) {
      const saveError = error as SaveNodeError
      const shouldQueue = saveError.stage !== 'tag' && shouldQueueError(saveError.original ?? saveError)
      if (shouldQueue) {
        enqueuePayload(payload, errorToString(saveError))
        setRawInput('')
        setSaveMessage({ tone: 'offline', text: 'Queued offline; will sync.' })
        setQueueCount(getQueueCount())
        return
      }
      setSaveMessage({ tone: 'error', text: errorToString(saveError) })
    } finally {
      setSaving(false)
    }
  }

  async function handleTogglePinned(row: RecentRow) {
    const nextPinned = !row.pinned
    setRecent(prev => prev.map(item => (item.id === row.id ? { ...item, pinned: nextPinned } : item)))
    const { error } = await supabase.rpc('set_node_pinned', { node_id: row.id, pinned: nextPinned })
    if (error) {
      setRecent(prev => prev.map(item => (item.id === row.id ? { ...item, pinned: row.pinned } : item)))
      setSaveMessage({ tone: 'error', text: error.message })
    }
  }

  async function handleMarkDone(row: RecentRow) {
    const nextStatus = row.status === 'done' ? 'active' : 'done'
    setRecent(prev => prev.map(item => (item.id === row.id ? { ...item, status: nextStatus } : item)))
    const { error } = await supabase.rpc('set_node_status', { node_id: row.id, new_status: nextStatus })
    if (error) {
      setRecent(prev => prev.map(item => (item.id === row.id ? { ...item, status: row.status } : item)))
      setSaveMessage({ tone: 'error', text: error.message })
    }
  }

  async function handleArchive(row: RecentRow) {
    setRecent(prev => prev.map(item => (item.id === row.id ? { ...item, status: 'archived' } : item)))
    const { error } = await supabase.rpc('set_node_status', { node_id: row.id, new_status: 'archived' })
    if (error) {
      setRecent(prev => prev.map(item => (item.id === row.id ? { ...item, status: row.status } : item)))
      setSaveMessage({ tone: 'error', text: error.message })
    }
  }

  async function handleCopyLink() {
    const url = buildCaptureUrl({
      title: parsed.title.trim(),
      body,
      tags: parsed.tags,
      context: parsed.context,
      status: parsed.status,
      type: parsed.type,
    })
    try {
      await navigator.clipboard.writeText(url)
      localStorage.setItem(CAPTURE_LINK_COPIED_KEY, String(Date.now()))
      setSaveMessage({ tone: 'success', text: 'Capture link copied.' })
    } catch {
      setSaveMessage({ tone: 'error', text: 'Unable to copy capture link.' })
    }
  }

  async function handleCopyLinkWithText() {
    const raw = rawInput.trim()
    const url = new URL('/capture', window.location.origin)
    if (raw) url.searchParams.set('text', raw)
    try {
      await navigator.clipboard.writeText(url.toString())
      localStorage.setItem(CAPTURE_LINK_COPIED_KEY, String(Date.now()))
      setSaveMessage({ tone: 'success', text: 'Capture link with text copied.' })
    } catch {
      setSaveMessage({ tone: 'error', text: 'Unable to copy capture link.' })
    }
  }

  function applySuggestedTags() {
    if (suggestedTags.length === 0) return
    setRawInput(prev => {
      const { headline, body } = splitInput(prev)
      const tokenString = suggestedTags.map(tag => `#${tag}`).join(' ')
      const nextHeadline = headline.trim() ? `${tokenString} ${headline}` : tokenString
      return body ? `${nextHeadline}\n${body}` : nextHeadline
    })
    inputRef.current?.focus()
  }

  function applySuggestedTitle() {
    if (!linkInfo) return
    setRawInput(prev => {
      const { headline, body } = splitInput(prev)
      const nextHeadline = headline.trim() ? `${linkInfo.suggestedTitle} ${headline}` : linkInfo.suggestedTitle
      return body ? `${nextHeadline}\n${body}` : nextHeadline
    })
    inputRef.current?.focus()
  }

  return (
    <div className="stack capturePage">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div className="stack-sm">
          <h2>Capture</h2>
          <span className="muted" style={{ fontSize: 12 }}>Quick entry with tokens. Shift+Enter for notes.</span>
        </div>
        <div className="row row--wrap">
          {queueCount > 0 && (
            <span className="badge">Queued: {queueCount}</span>
          )}
          <button
            type="button"
            onClick={() => void runSync()}
            disabled={syncing || queueCount === 0}
            className="button button--ghost"
          >
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      </div>

      {!online && (
        <div className="card" style={{ borderColor: 'rgba(245, 158, 11, 0.6)', background: 'rgba(245, 158, 11, 0.12)' }}>
          Offline mode: captures will be queued and synced when you’re back online.
        </div>
      )}

      {prefilled && (
        <div
          className="card row row--wrap"
          style={{ background: 'rgba(37, 99, 235, 0.15)', borderColor: 'rgba(37, 99, 235, 0.45)' }}
        >
          <span>Prefilled from Shortcut</span>
          <button
            onClick={() => setRawInput('')}
            className="button button--ghost"
          >
            Clear
          </button>
        </div>
      )}

      {showInstallHint && (
        <div className="card installHint">
          <div className="stack-sm">
            <strong>Install Mindmap</strong>
            {installPrompt && (
              <span className="muted" style={{ fontSize: 12 }}>
                Install this app for a fast, standalone experience.
              </span>
            )}
            {installPrompt && (
              <div className="row row--wrap">
                <button
                  type="button"
                  onClick={async () => {
                    await installPrompt.prompt()
                    const choice = await installPrompt.userChoice
                    if (choice.outcome === 'accepted') {
                      setInstallPrompt(null)
                      setInstallDismissed(true)
                    }
                  }}
                  className="button button--primary"
                >
                  Install
                </button>
                <button type="button" onClick={dismissInstallHint} className="button button--ghost">
                  Not now
                </button>
              </div>
            )}
            {!installPrompt && isIos && (
              <div className="stack-sm">
                <span className="muted" style={{ fontSize: 12 }}>
                  On iOS: tap Share, then “Add to Home Screen”.
                </span>
                <button type="button" onClick={dismissInstallHint} className="button button--ghost">
                  Got it
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card captureComposer">
        <div className="captureTemplates">
          {CAPTURE_TEMPLATES.map(template => (
            <button
              key={template.label}
              type="button"
              className="button button--ghost"
              onClick={() => {
                setRawInput(prev => {
                  const next = prev.trim().length > 0
                    ? `${template.token}${prev}`.trimStart()
                    : template.token
                  return next
                })
                inputRef.current?.focus()
              }}
            >
              {template.label}
            </button>
          ))}
        </div>

        <textarea
          ref={inputRef}
          value={rawInput}
          onChange={(event) => {
            setRawInput(event.target.value)
            if (saveMessage) setSaveMessage(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              if (canSubmit) {
                event.preventDefault()
                void handleSave()
              }
            }
          }}
          placeholder="What’s on your mind? Use #tags, @context, !status, type:task, due:YYYY-MM-DD"
          rows={5}
          className="textarea captureInput"
          aria-label="Quick capture input"
        />

        <div className="capturePreview">
          <div className="row row--wrap">
            <span className="chip chip--compact">{parsed.type ?? 'idea'}</span>
            <span className="chip chip--compact">{parsed.status ?? 'inbox'}</span>
            {parsed.context && <span className="chip chip--compact">@{parsed.context}</span>}
            {parsed.due_at && <span className="chip chip--compact">due {parsed.due_at}</span>}
            {linkInfo && <span className="chip chip--compact">link detected</span>}
          </div>
          <div style={{ fontWeight: 600 }}>
            {parsed.title.trim() ? parsed.title.trim() : <span className="muted">Title required…</span>}
          </div>
          {parsed.tags.length > 0 && <TagChips tags={parsed.tags} compact />}
          {linkInfo && (
            <div className="row row--wrap" style={{ fontSize: 12 }}>
              <span className="muted">{linkInfo.hostname}</span>
              {suggestedTags.length > 0 && (
                <button type="button" onClick={applySuggestedTags} className="chip chip--compact chip--clickable">
                  Add #{suggestedTags.join(' #')}
                </button>
              )}
              {!parsed.title.trim() && (
                <button type="button" onClick={applySuggestedTitle} className="chip chip--compact chip--clickable">
                  Use suggested title
                </button>
              )}
            </div>
          )}
          {body && (
            <div className="muted" style={{ fontSize: 12 }}>
              Notes: {body.slice(0, 120)}{body.length > 120 ? '…' : ''}
            </div>
          )}
          {validation.errors.length > 0 && (
            <div className="captureErrors" role="alert">
              <strong>Errors</strong>
              {validation.errors.map(message => (
                <div key={message}>{message}</div>
              ))}
            </div>
          )}
          {validation.warnings.length > 0 && (
            <div className="captureWarnings" role="status" aria-live="polite">
              <strong>Warnings</strong>
              {validation.warnings.map(message => (
                <div key={message}>{message}</div>
              ))}
            </div>
          )}
        </div>

        <div className="row row--wrap">
          <button
            onClick={() => void handleSave()}
            className="button button--primary"
            disabled={!canSubmit}
            style={{ flex: '1 1 160px' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => setRawInput('')}
            className="button button--ghost"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => void handleCopyLink()}
            className="button button--ghost"
          >
            Copy capture link
          </button>
          <button
            type="button"
            onClick={() => void handleCopyLinkWithText()}
            className="button button--ghost"
          >
            Copy link with text
          </button>
        </div>

        {saveMessage && (
          <div
            role="status"
            className="card captureToast"
            style={{
              background: saveMessage.tone === 'offline'
                ? 'rgba(245, 158, 11, 0.16)'
                : saveMessage.tone === 'error'
                  ? 'rgba(248, 113, 113, 0.16)'
                  : 'rgba(16, 185, 129, 0.16)',
              borderColor: saveMessage.tone === 'offline'
                ? 'rgba(245, 158, 11, 0.4)'
                : saveMessage.tone === 'error'
                  ? 'rgba(248, 113, 113, 0.4)'
                  : 'rgba(16, 185, 129, 0.4)',
            }}
          >
            {saveMessage.text}
          </div>
        )}
      </div>

      <section className="card captureRecent">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>Recent captures</strong>
          <button type="button" className="button button--ghost" onClick={() => void loadRecent()}>
            Refresh
          </button>
        </div>
        {recentLoading && <span className="muted" style={{ fontSize: 12 }}>Loading…</span>}
        {!recentLoading && recent.length === 0 && (
          <span className="muted" style={{ fontSize: 12 }}>No recent captures yet.</span>
        )}
        {recent.length > 0 && (
          <div className="stack-sm">
            {recent.map(row => (
              <div key={row.id} className="captureRecentItem">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <button
                    type="button"
                    onClick={() => navigate(`/node/${row.id}`)}
                    className="button button--ghost"
                    style={{ padding: 0, fontWeight: 600 }}
                  >
                    {row.title}
                  </button>
                  <span className="muted" style={{ fontSize: 12 }}>{row.type}</span>
                </div>
                <div className="row row--wrap">
                  <span className="chip chip--compact">{row.status}</span>
                  {row.pinned && <span className="chip chip--compact">pinned</span>}
                  {Array.isArray(row.tags) && row.tags.length > 0 && (
                    <TagChips tags={row.tags} compact />
                  )}
                </div>
                <div className="captureRecentActions">
                  <button
                    type="button"
                    className="chip chip--compact chip--clickable"
                    onClick={() => void handleTogglePinned(row)}
                  >
                    {row.pinned ? 'Unpin' : 'Pin'}
                  </button>
                  {row.type === 'task' ? (
                    <button
                      type="button"
                      className="chip chip--compact chip--clickable"
                      onClick={() => void handleMarkDone(row)}
                    >
                      {row.status === 'done' ? 'Undone' : 'Done'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="chip chip--compact chip--clickable"
                      onClick={() => void handleArchive(row)}
                    >
                      Archive
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
