import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import TagInput from '../components/TagInput'
import TagChips from '../components/TagChips'
import { STATUSES, type Status } from '../utils/status'

type NodeType = 'idea' | 'task'

const RELATIONS = ['related', 'supports', 'blocks', 'depends_on'] as const

type Relation = typeof RELATIONS[number]

type NodeRecord = {
  id: number
  owner_id?: string
  type: NodeType
  title: string
  body: string | null
  status: Status
  created_at?: string | null
  updated_at?: string | null
}

type NodeDetailResponse = {
  node: NodeRecord
  tags: string[] | null
}

type LinkRow = {
  edge_id: number
  direction: 'incoming' | 'outgoing'
  relation: string
  from_node_id: number
  to_node_id: number
  other_node_id: number
  other_node_title: string
  created_at: string
}

type NodeListRow = {
  id: number
  title: string
  type: string
  status: string
  tags?: string[] | null
}

function normalizeTag(raw: string) {
  return raw.trim().toLowerCase()
}

function formatTimestamp(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString()
}

export default function NodeDetail() {
  const params = useParams()
  const nodeId = Number(params.id)
  const [node, setNode] = useState<NodeRecord | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [type, setType] = useState<NodeType>('idea')
  const [status, setStatus] = useState<Status>('inbox')
  const [tags, setTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const [links, setLinks] = useState<LinkRow[]>([])
  const [linksLoading, setLinksLoading] = useState(false)
  const [linksError, setLinksError] = useState<string | null>(null)

  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [linkSearch, setLinkSearch] = useState('')
  const [linkResults, setLinkResults] = useState<NodeListRow[]>([])
  const [linkLoading, setLinkLoading] = useState(false)
  const [linkRelation, setLinkRelation] = useState<Relation>('related')
  const [linkWorking, setLinkWorking] = useState(false)

  const invalidId = Number.isNaN(nodeId) || nodeId <= 0

  useEffect(() => {
    if (invalidId) {
      setErrorMessage('Invalid node id.')
      setLoading(false)
      return
    }

    let active = true

    async function loadDetail() {
      setLoading(true)
      setErrorMessage(null)
      const { data, error } = await supabase.rpc('get_node_detail', { node_id: nodeId })
      if (!active) return
      if (error) {
        setErrorMessage(error.message)
        setLoading(false)
        return
      }

      const detail = (Array.isArray(data) ? data[0] : data) as NodeDetailResponse | null
      if (!detail?.node) {
        setErrorMessage('Node not found.')
        setLoading(false)
        return
      }

      const nextNode = detail.node
      setNode(nextNode)
      setTitle(nextNode.title ?? '')
      setBody(nextNode.body ?? '')
      setType(nextNode.type ?? 'idea')
      setStatus(nextNode.status ?? 'inbox')
      setTags((detail.tags ?? []).map(normalizeTag).filter(Boolean))
      setLoading(false)
    }

    async function loadLinks() {
      setLinksLoading(true)
      setLinksError(null)
      const { data, error } = await supabase.rpc('get_node_links', { node_id: nodeId })
      if (!active) return
      if (error) {
        setLinksError(error.message)
        setLinks([])
        setLinksLoading(false)
        return
      }
      setLinks((data ?? []) as LinkRow[])
      setLinksLoading(false)
    }

    loadDetail()
    loadLinks()

    return () => { active = false }
  }, [nodeId, invalidId])

  useEffect(() => {
    if (!linkModalOpen) return
    let active = true

    async function loadLinkResults() {
      setLinkLoading(true)
      const { data, error } = await supabase.rpc('list_nodes', {
        lim: 30,
        q: linkSearch.trim() ? linkSearch.trim() : null,
        type_filter: null,
        status_filter: null,
        tag_filter: null,
      })

      if (!active) return

      if (error) {
        setLinkLoading(false)
        setLinkResults([])
        return
      }

      const normalized = ((data ?? []) as NodeListRow[]).map(row => ({
        ...row,
        tags: Array.isArray(row.tags) ? row.tags.map(normalizeTag) : [],
      }))

      setLinkResults(normalized)
      setLinkLoading(false)
    }

    loadLinkResults()

    return () => { active = false }
  }, [linkModalOpen, linkSearch])

  const outgoingLinks = useMemo(
    () => links.filter(link => link.direction === 'outgoing'),
    [links]
  )

  const incomingLinks = useMemo(
    () => links.filter(link => link.direction === 'incoming'),
    [links]
  )

  const outgoingKeySet = useMemo(() => {
    const set = new Set<string>()
    for (const link of outgoingLinks) {
      set.add(`${link.other_node_id}:${link.relation}`)
    }
    return set
  }, [outgoingLinks])

  async function upsertTags(names: string[]) {
    const session = (await supabase.auth.getSession()).data.session
    if (!session) throw new Error('Not signed in.')

    const unique = Array.from(new Set(names.map(normalizeTag).filter(Boolean)))
    if (unique.length === 0) return new Map<string, number>()

    const { data, error } = await supabase
      .from('tags')
      .upsert(
        unique.map(name => ({ owner_id: session.user.id, name })),
        { onConflict: 'owner_id,name' }
      )
      .select('id,name')

    if (error) throw error

    const map = new Map<string, number>()
    for (const row of data ?? []) {
      const name = normalizeTag((row as { name: string }).name)
      const id = (row as { id: number }).id
      map.set(name, id)
    }
    return map
  }

  async function syncTags(nodeIdValue: number, names: string[]) {
    const desiredTags = Array.from(new Set(names.map(normalizeTag).filter(Boolean)))
    const tagMap = await upsertTags(desiredTags)
    const desiredTagIds = Array.from(tagMap.values())

    const { data, error } = await supabase
      .from('node_tags')
      .select('tag_id, tags(name)')
      .eq('node_id', nodeIdValue)

    if (error) throw error

    const existingTagIds = new Set<number>()
    for (const row of data ?? []) {
      const tagId = (row as { tag_id: number }).tag_id
      if (typeof tagId === 'number') existingTagIds.add(tagId)
    }

    if (desiredTagIds.length === 0) {
      if (existingTagIds.size > 0) {
        const { error: deleteAllError } = await supabase
          .from('node_tags')
          .delete()
          .eq('node_id', nodeIdValue)

        if (deleteAllError) throw deleteAllError
      }
      return
    }

    const toInsert: { node_id: number; tag_id: number }[] = []
    for (const tagId of desiredTagIds) {
      if (!existingTagIds.has(tagId)) {
        toInsert.push({ node_id: nodeIdValue, tag_id: tagId })
      }
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('node_tags')
        .upsert(toInsert, { onConflict: 'node_id,tag_id' })

      if (insertError) throw insertError
    }

    const removeTagIds = Array.from(existingTagIds).filter(id => !desiredTagIds.includes(id))
    if (removeTagIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('node_tags')
        .delete()
        .eq('node_id', nodeIdValue)
        .in('tag_id', removeTagIds)

      if (deleteError) throw deleteError
    }
  }

  async function handleSave() {
    if (!node) return
    if (!title.trim()) {
      setSaveMessage('Title required.')
      return
    }

    setSaving(true)
    setSaveMessage(null)

    const session = (await supabase.auth.getSession()).data.session
    if (!session) {
      setSaving(false)
      setSaveMessage('Not signed in.')
      return
    }

    const updates = {
      title: title.trim(),
      body,
      type,
      status,
    }

    const { data, error } = await supabase
      .from('nodes')
      .update(updates)
      .eq('id', node.id)
      .eq('owner_id', session.user.id)
      .select('*')
      .single()

    if (error) {
      setSaving(false)
      setSaveMessage(error.message)
      return
    }

    try {
      await syncTags(node.id, tags)
    } catch (error) {
      setSaving(false)
      setSaveMessage((error as Error).message)
      return
    }

    const nextNode = (data as NodeRecord) ?? node
    setNode(nextNode)
    setSaveMessage('Saved ✅')
    setSaving(false)
  }

  async function handleArchive() {
    if (!node) return
    const previousStatus = status
    setStatus('archived')
    setSaving(true)

    const { error } = await supabase
      .from('nodes')
      .update({ status: 'archived' })
      .eq('id', node.id)

    if (error) {
      setSaving(false)
      setStatus(previousStatus)
      setSaveMessage(error.message)
      return
    }

    setNode(prev => (prev ? { ...prev, status: 'archived' } : prev))
    setSaving(false)
    setSaveMessage('Archived.')
  }

  async function handleRemoveLink(edgeId: number) {
    const previous = links
    setLinks(prev => prev.filter(link => link.edge_id !== edgeId))
    const { error } = await supabase.rpc('delete_edge', { edge_id: edgeId })
    if (error) {
      setLinks(previous)
      alert(error.message)
    }
  }

  async function handleCreateLink(targetId: number) {
    if (!node) return
    if (targetId === node.id) return
    setLinkWorking(true)

    const { error } = await supabase.rpc('create_edge', {
      from_node_id: node.id,
      to_node_id: targetId,
      relation: linkRelation,
    })

    if (error) {
      setLinkWorking(false)
      alert(error.message)
      return
    }

    setLinkWorking(false)
    setLinkModalOpen(false)
    setLinkSearch('')

    const { data, error: linksError } = await supabase.rpc('get_node_links', { node_id: node.id })
    if (linksError) {
      alert(linksError.message)
      return
    }
    setLinks((data ?? []) as LinkRow[])
  }

  const createdAt = formatTimestamp(node?.created_at)
  const updatedAt = formatTimestamp(node?.updated_at)

  const filteredResults = linkResults.filter(row => row.id !== node?.id)

  if (loading) return <div className="muted">Loading…</div>

  if (errorMessage) {
    return (
      <div>
        <p style={{ color: '#f87171' }}>{errorMessage}</p>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="stack-sm">
          <h2>Node Detail</h2>
          {node && (
            <div className="muted" style={{ fontSize: 12 }}>
              ID {node.id}
            </div>
          )}
        </div>
        <div className="row row--wrap">
          <button onClick={handleArchive} disabled={saving || status === 'archived'} className="button button--ghost">Archive</button>
          <button onClick={handleSave} disabled={saving} className="button button--primary">Save</button>
        </div>
      </div>

      {saveMessage && <div className="muted" style={{ fontSize: 12 }}>{saveMessage}</div>}

      <div className="stack-sm">
        <div className="row row--wrap">
          <button onClick={() => setType('idea')} disabled={type === 'idea'} className={`button ${type === 'idea' ? 'button--primary' : 'button--ghost'}`}>Idea</button>
          <button onClick={() => setType('task')} disabled={type === 'task'} className={`button ${type === 'task' ? 'button--primary' : 'button--ghost'}`}>Task</button>
        </div>

        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Title"
          className="input"
        />

        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Details…"
          rows={6}
          className="textarea"
        />

        <div className="stack-sm">
          <label className="muted" style={{ fontSize: 12 }}>Status</label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as Status)}
            className="select"
          >
            {STATUSES.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>

        <div className="stack-sm">
          <label className="muted" style={{ fontSize: 12 }}>Tags</label>
          <TagInput value={tags} onChange={setTags} placeholder="Add tags" />
        </div>

        <div className="stack-sm muted" style={{ fontSize: 12 }}>
          {createdAt && <div>Created: {createdAt}</div>}
          {updatedAt && <div>Updated: {updatedAt}</div>}
        </div>
      </div>

      <section className="stack-sm">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>Links</h3>
          <button type="button" onClick={() => setLinkModalOpen(true)} className="button button--ghost">Link to…</button>
        </div>

        {linksLoading && <p>Loading links…</p>}
        {linksError && <p style={{ color: '#f87171' }}>{linksError}</p>}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 12,
          }}
        >
          <div className="card" style={{ display: 'grid', gap: 8 }}>
            <strong>Outgoing</strong>
            {outgoingLinks.length === 0 && <span className="muted" style={{ fontSize: 12 }}>No links yet.</span>}
            {outgoingLinks.map(link => (
              <div
                key={link.edge_id}
                className="row"
                style={{ justifyContent: 'space-between' }}
              >
                <Link to={`/node/${link.other_node_id}`} style={{ fontSize: 14 }}>
                  {link.other_node_title}
                </Link>
                <div className="row">
                  <span className="muted" style={{ fontSize: 11 }}>{link.relation}</span>
                  <button type="button" onClick={() => handleRemoveLink(link.edge_id)} className="button button--ghost">Remove</button>
                </div>
              </div>
            ))}
          </div>

          <div className="card" style={{ display: 'grid', gap: 8 }}>
            <strong>Backlinks</strong>
            {incomingLinks.length === 0 && <span className="muted" style={{ fontSize: 12 }}>No backlinks yet.</span>}
            {incomingLinks.map(link => (
              <div key={link.edge_id} className="row" style={{ justifyContent: 'space-between' }}>
                <Link to={`/node/${link.other_node_id}`} style={{ fontSize: 14 }}>
                  {link.other_node_title}
                </Link>
                <span className="muted" style={{ fontSize: 11 }}>{link.relation}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {linkModalOpen && (
        <div className="modalOverlay">
          <div className="modalPanel stack-sm">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>Link to…</strong>
              <button type="button" onClick={() => setLinkModalOpen(false)} className="button button--ghost">Close</button>
            </div>

            <input
              value={linkSearch}
              onChange={(event) => setLinkSearch(event.target.value)}
              placeholder="Search nodes…"
              className="input"
            />

            <div className="stack-sm">
              <label className="muted" style={{ fontSize: 12 }}>Relation</label>
              <select
                value={linkRelation}
                onChange={(event) => setLinkRelation(event.target.value as Relation)}
                className="select"
              >
                {RELATIONS.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            {linkLoading && <span className="muted" style={{ fontSize: 12 }}>Loading…</span>}

            <div className="stack-sm" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
              {filteredResults.length === 0 && !linkLoading && (
                <span className="muted" style={{ fontSize: 12 }}>No results.</span>
              )}
              {filteredResults.map(result => {
                const disabled = outgoingKeySet.has(`${result.id}:${linkRelation}`)
                return (
                  <div
                    key={result.id}
                    className="card"
                    style={{ display: 'grid', gap: 6 }}
                  >
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <Link to={`/node/${result.id}`} style={{ fontWeight: 600 }}>
                        {result.title}
                      </Link>
                      <span className="muted" style={{ fontSize: 11 }}>{result.type}</span>
                    </div>
                    <TagChips tags={result.tags ?? []} compact />
                    <button
                      type="button"
                      onClick={() => handleCreateLink(result.id)}
                      disabled={linkWorking || disabled}
                      className="button button--primary"
                      style={{ width: 'fit-content' }}
                    >
                      {disabled ? 'Already linked' : 'Link'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
