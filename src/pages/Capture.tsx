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
    <div className="stack">
      <h2>Capture</h2>

      {prefilled && (
        <div
          className="card row row--wrap"
          style={{ background: 'rgba(37, 99, 235, 0.15)', borderColor: 'rgba(37, 99, 235, 0.45)' }}
        >
          <span>Prefilled from Shortcut</span>
          <button onClick={clearForm} className="button button--ghost">Clear</button>
          <button onClick={removeQueryFromUrl} className="button button--ghost">Remove query from URL</button>
        </div>
      )}

      <div className="row row--wrap">
        <button
          onClick={() => setType('idea')}
          disabled={type === 'idea'}
          className={`button ${type === 'idea' ? 'button--primary' : 'button--ghost'}`}
        >
          Idea
        </button>
        <button
          onClick={() => setType('task')}
          disabled={type === 'task'}
          className={`button ${type === 'task' ? 'button--primary' : 'button--ghost'}`}
        >
          Task
        </button>
      </div>

      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as Status)}
        className="select"
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
        className="input"
      />

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Details…"
        rows={6}
        className="textarea"
      />

      <TagInput value={tags} onChange={setTags} placeholder="Add tags" />

      <input
        value={context}
        onChange={(e) => setContext(e.target.value)}
        placeholder="context (home/shop/computer/errands)"
        className="input"
      />

      {type === 'task' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <input
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value ? Number(e.target.value) : '')}
            placeholder="duration (min)"
            inputMode="numeric"
            className="input"
          />
          <select
            value={energy}
            onChange={(e) => setEnergy(e.target.value as Energy)}
            className="select"
          >
            <option value="low">low energy</option>
            <option value="medium">medium energy</option>
            <option value="high">high energy</option>
          </select>
        </div>
      )}

      <button onClick={save} className="button button--primary" style={{ width: '100%' }}>
        Save
      </button>

      {saveMessage && (
        <div
          role="status"
          className="card"
          style={{
            background: saveMessage.tone === 'offline' ? 'rgba(245, 158, 11, 0.16)' : 'rgba(16, 185, 129, 0.16)',
            borderColor: saveMessage.tone === 'offline' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.4)',
          }}
        >
          {saveMessage.text}
        </div>
      )}
    </div>
  )
}
