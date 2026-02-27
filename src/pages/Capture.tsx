import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import { enqueuePayload, errorToString, getQueueCount, onQueueUpdate, shouldQueueError, syncOfflineQueue, type SaveNodeError } from '../offlineQueue'
import { createNodeWithTags, type NodeWritePayload } from '../lib/nodeWrites'
import { normalizeTag } from '../utils/tagUtils'
import TagChips from '../components/TagChips'
import RecentCaptures, { type RecentRow } from '../components/RecentCaptures'
import InstallPrompt, { type BeforeInstallPromptEvent } from '../components/InstallPrompt'

type SaveMessage = { tone: 'success' | 'offline' | 'error'; text: string }

const INSTALL_DISMISS_KEY = 'mm_install_hint_dismissed'

function splitInput(raw: string) {
  const parts = raw.split(/\r?\n/)
  const headline = parts[0] ?? ''
  const body = parts.slice(1).join('\n').trim()
  return { headline, body }
}

function extractTagsAndTitle(headline: string) {
  const tokens = headline.trim().split(/\s+/).filter(Boolean)
  const tags: string[] = []
  const titleParts: string[] = []

  for (const token of tokens) {
    if (token.startsWith('#') && token.length > 1) {
      const tag = normalizeTag(token.slice(1))
      if (tag && !tags.includes(tag)) {
        tags.push(tag)
      }
    } else {
      titleParts.push(token)
    }
  }

  return {
    title: titleParts.join(' ').trim(),
    tags,
  }
}

export default function Capture() {
  const [rawInput, setRawInput] = useState('')
  const [saveMessage, setSaveMessage] = useState<SaveMessage | null>(null)
  const [saving, setSaving] = useState(false)
  const [queueCount, setQueueCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [recent, setRecent] = useState<RecentRow[]>([])
  const [recentLoading, setRecentLoading] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installDismissed, setInstallDismissed] = useState(false)
  const [online, setOnline] = useState(true)
  const [showPreview, setShowPreview] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const { headline, body } = useMemo(() => splitInput(rawInput), [rawInput])
  const { title, tags } = useMemo(() => extractTagsAndTitle(headline), [headline])

  const canSubmit = title.trim() !== '' && !saving

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
      setSaveMessage({ tone: 'error', text: 'Please enter something to capture.' })
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

    // All captures go to inbox as ideas - refine later in Inbox
    const payload: NodeWritePayload = {
      type: 'idea',
      title: title.trim(),
      body: body,
      tags: tags,
      status: 'inbox',
      context: null,
      energy: null,
      duration_minutes: null,
      due_at: null,
    }

    try {
      await createNodeWithTags({
        supabase,
        userId: session.user.id,
        payload,
        allowPartialTags: false,
      })

      setRawInput('')
      setSaveMessage({ tone: 'success', text: 'Captured!' })
      void loadRecent()
    } catch (error) {
      const saveError = error as SaveNodeError
      const shouldQueue = saveError.stage !== 'tag' && shouldQueueError(saveError.original ?? saveError)
      if (shouldQueue) {
        enqueuePayload(payload, errorToString(saveError))
        setRawInput('')
        setSaveMessage({ tone: 'offline', text: 'Saved offline; will sync.' })
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

  return (
    <div className="stack capturePage">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div className="stack-sm">
          <h2>Capture</h2>
          <span className="muted" style={{ fontSize: 12 }}>Quick brain dump. Add #tags if you want. Refine later.</span>
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
          Offline mode: captures will be queued and synced when you're back online.
        </div>
      )}

      {showInstallHint && (
        <InstallPrompt
          installPrompt={installPrompt}
          isIos={isIos}
          onInstalled={() => {
            setInstallPrompt(null)
            setInstallDismissed(true)
          }}
          onDismiss={dismissInstallHint}
        />
      )}

      <div className="card captureComposer">
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
          placeholder="What's on your mind? Add #tags if you want."
          rows={4}
          className="textarea captureInput"
          aria-label="Quick capture input"
        />

        {/* Minimal preview - collapsed by default */}
        {tags.length > 0 && !showPreview && (
          <div className="row" style={{ fontSize: 12, gap: 8 }}>
            <span className="muted">{tags.length} tag{tags.length !== 1 ? 's' : ''} detected</span>
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="button button--ghost"
              style={{ padding: '2px 8px', fontSize: 11 }}
            >
              Show preview
            </button>
          </div>
        )}

        {showPreview && (
          <div className="capturePreview" style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 6 }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="muted" style={{ fontSize: 11 }}>Preview</span>
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="button button--ghost"
                style={{ padding: '2px 8px', fontSize: 11 }}
              >
                Hide
              </button>
            </div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {title || <span className="muted">Enter your idea…</span>}
            </div>
            {tags.length > 0 && <TagChips tags={tags} compact />}
            {body && (
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Notes: {body.slice(0, 80)}{body.length > 80 ? '…' : ''}
              </div>
            )}
          </div>
        )}

        <div className="row row--wrap">
          <button
            onClick={() => void handleSave()}
            className="button button--primary"
            disabled={!canSubmit}
            style={{ flex: '1 1 160px' }}
          >
            {saving ? 'Saving…' : 'Capture'}
          </button>
          <button
            type="button"
            onClick={() => setRawInput('')}
            className="button button--ghost"
          >
            Clear
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

      <RecentCaptures
        items={recent}
        loading={recentLoading}
        onRefresh={() => void loadRecent()}
        onTogglePinned={(row) => void handleTogglePinned(row)}
        onMarkDone={(row) => void handleMarkDone(row)}
        onArchive={(row) => void handleArchive(row)}
      />
    </div>
  )
}
