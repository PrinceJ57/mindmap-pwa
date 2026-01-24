import { useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'

type NodeType = 'idea' | 'task'
type Energy = 'low' | 'medium' | 'high'

export default function Capture() {
  const [type, setType] = useState<NodeType>('idea')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tagsRaw, setTagsRaw] = useState('')
  const [context, setContext] = useState('')
  const [energy, setEnergy] = useState<Energy>('medium')
  const [durationMinutes, setDurationMinutes] = useState<number | ''>('')

  const tags = useMemo(
    () => tagsRaw.split(',').map(t => t.trim().toLowerCase()).filter(Boolean),
    [tagsRaw]
  )

  async function save() {
    const session = (await supabase.auth.getSession()).data.session
    if (!session) return alert('Not signed in.')

    if (!title.trim()) return alert('Title required.')

    // 1) insert node
    const { data: node, error: nodeErr } = await supabase
      .from('nodes')
      .insert({
        owner_id: session.user.id,
        type,
        title: title.trim(),
        body,
        status: 'inbox',
        context: context || null,
        energy: type === 'task' ? energy : null,
        duration_minutes: type === 'task' && durationMinutes !== '' ? durationMinutes : null,
      })
      .select('id')
      .single()

    if (nodeErr) return alert(nodeErr.message)

    // 2) upsert tags + link
    for (const name of tags) {
      const { data: tag, error: tagErr } = await supabase
        .from('tags')
        .upsert({ owner_id: session.user.id, name }, { onConflict: 'owner_id,name' })
        .select('id')
        .single()

      if (tagErr) return alert(tagErr.message)

      const { error: linkErr } = await supabase
        .from('node_tags')
        .upsert({ node_id: node.id, tag_id: tag.id })

      if (linkErr) return alert(linkErr.message)
    }

    setTitle('')
    setBody('')
    setTagsRaw('')
    setContext('')
    setDurationMinutes('')
    alert('Saved ✅')
  }

  return (
    <div>
      <h2>Capture</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => setType('idea')} disabled={type === 'idea'}>Idea</button>
        <button onClick={() => setType('task')} disabled={type === 'task'}>Task</button>
      </div>

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

      <input
        value={tagsRaw}
        onChange={(e) => setTagsRaw(e.target.value)}
        placeholder="tags (comma-separated)"
        style={{ width: '100%', padding: 12, fontSize: 16, marginBottom: 12 }}
      />

      <input
        value={context}
        onChange={(e) => setContext(e.target.value)}
        placeholder="context (home/shop/computer/errands)"
        style={{ width: '100%', padding: 12, fontSize: 16, marginBottom: 12 }}
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
            onChange={(e) => setEnergy(e.target.value as any)}
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
    </div>
  )
}
