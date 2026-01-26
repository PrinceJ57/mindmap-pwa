import { useCallback, useEffect, useRef, useState } from 'react'
import TagInput from '../components/TagInput'
import { supabase } from '../supabaseClient'
import { enqueuePayload, errorToString, shouldQueueError, type SaveNodeError } from '../offlineQueue'
import { createNodeWithTags, type Energy, type NodeType, type NodeWritePayload } from '../lib/nodeWrites'
import { CAPTURE_PREFILL_STORAGE_KEY, parsePrefillParams } from '../lib/queryPrefill'
import { STATUSES, type Status } from '../utils/status'

type SaveMessage = { tone: 'success' | 'offline'; text: string }

export default function Capture() {
  const [type, setType] = useState<NodeType>('idea')
  const [status, setStatus] = useState<Status>('inbox')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [context, setContext] = useState('')
  const [energy, setEnergy] = useState<Energy>('medium')
  const [durationMinutes, setDurationMinutes] = useState<number | ''>('')
  const [saveMessage, setSaveMessage] = useState<SaveMessage | null>(null)
  const [prefilled, setPrefilled] = useState(false)
  const prefillAppliedRef = useRef(false)

  const removeQueryFromUrl = useCallback(() => {
    const next = window.location.pathname + window.location.hash
    window.history.replaceState(null, '', next)
  }, [])

  const clearForm = () => {
    setType('idea')
    setStatus('inbox')
    setTitle('')
    setBody('')
    setTags([])
    setContext('')
    setEnergy('medium')
    setDurationMinutes('')
    setSaveMessage(null)
    setPrefilled(false)
    window.sessionStorage.removeItem(CAPTURE_PREFILL_STORAGE_KEY)
    removeQueryFromUrl()
  }

  useEffect(() => {
    if (prefillAppliedRef.current) return

    const search = window.location.search
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

    if (!prefill.hasPrefill) return

    prefillAppliedRef.current = true
    setType(prefill.type ?? 'idea')
    setStatus(prefill.status ?? 'inbox')
    setTitle(prefill.title)
    setBody(prefill.body)
    setTags(prefill.tags)
    setContext(prefill.context)
    setPrefilled(true)
    window.sessionStorage.removeItem(CAPTURE_PREFILL_STORAGE_KEY)
    if (search) removeQueryFromUrl()
  }, [removeQueryFromUrl])

  async function save() {
    setSaveMessage(null)
    const session = (await supabase.auth.getSession()).data.session
    if (!session) return alert('Not signed in.')

    if (!title.trim()) return alert('Title required.')

    const payload: NodeWritePayload = {
      type,
      title: title.trim(),
      body,
      tags,
      status,
      context: context.trim() ? context.trim() : null,
      energy: type === 'task' ? energy : null,
      duration_minutes: type === 'task' && durationMinutes !== '' ? durationMinutes : null,
      due_at: null,
    }

    try {
      await createNodeWithTags({
        supabase,
        userId: session.user.id,
        payload,
        allowPartialTags: false,
      })

      setTitle('')
      setBody('')
      setTags([])
      setContext('')
      setDurationMinutes('')
      setSaveMessage({ tone: 'success', text: 'Saved ✅' })
    } catch (error) {
      const saveError = error as SaveNodeError
      const shouldQueue = saveError.stage !== 'tag' && shouldQueueError(saveError.original ?? saveError)
      if (shouldQueue) {
        enqueuePayload(payload, errorToString(saveError))
        setTitle('')
        setBody('')
        setTags([])
        setContext('')
        setDurationMinutes('')
        setSaveMessage({ tone: 'offline', text: 'Saved offline; will sync.' })
        return
      }
      alert(errorToString(saveError))
    }
  }

  return (
    <div>
      <h2>Capture</h2>

      {prefilled && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
            marginBottom: 12,
            padding: '8px 10px',
            borderRadius: 6,
            background: '#eef4ff',
            color: '#1a1a1a',
            fontSize: 14,
          }}
        >
          <span>Prefilled from Shortcut</span>
          <button onClick={clearForm}>Clear</button>
          <button onClick={removeQueryFromUrl}>Remove query from URL</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={() => setType('idea')} disabled={type === 'idea'}>Idea</button>
        <button onClick={() => setType('task')} disabled={type === 'task'}>Task</button>
      </div>

      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as Status)}
        style={{ width: '100%', padding: 12, fontSize: 16, marginBottom: 12 }}
      >
        {STATUSES.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        style={{ width: '100%', padding: 12, fontSize: 16, marginBottom: 12 }}
      />

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Details…"
        rows={6}
        style={{ width: '100%', padding: 12, fontSize: 16, marginBottom: 12 }}
      />

      <TagInput value={tags} onChange={setTags} placeholder="Add tags" />

      <input
        value={context}
        onChange={(e) => setContext(e.target.value)}
        placeholder="context (home/shop/computer/errands)"
        style={{ width: '100%', padding: 12, fontSize: 16, marginTop: 12, marginBottom: 12 }}
      />

      {type === 'task' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <input
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value ? Number(e.target.value) : '')}
            placeholder="duration (min)"
            inputMode="numeric"
            style={{ width: '100%', padding: 12, fontSize: 16 }}
          />
          <select
            value={energy}
            onChange={(e) => setEnergy(e.target.value as Energy)}
            style={{ width: '100%', padding: 12, fontSize: 16 }}
          >
            <option value="low">low energy</option>
            <option value="medium">medium energy</option>
            <option value="high">high energy</option>
          </select>
        </div>
      )}

      <button onClick={save} style={{ width: '100%', padding: 14, fontSize: 16 }}>
        Save
      </button>

      {saveMessage && (
        <div
          role="status"
          style={{
            marginTop: 10,
            padding: '8px 10px',
            borderRadius: 6,
            background: saveMessage.tone === 'offline' ? '#fff4d6' : '#e7f7ef',
            color: '#1a1a1a',
            fontSize: 14,
          }}
        >
          {saveMessage.text}
        </div>
      )}
    </div>
  )
}
