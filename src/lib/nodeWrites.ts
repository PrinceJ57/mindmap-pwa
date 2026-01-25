import type { SupabaseClient } from '@supabase/supabase-js'

export type NodeType = 'idea' | 'task'
export type Energy = 'low' | 'medium' | 'high'

export type NodeWritePayload = {
  type: NodeType
  title: string
  body: string
  tags: string[]
  status: string
  context: string | null
  energy: Energy | null
  duration_minutes: number | null
  due_at: string | null
}

export type SaveNodeError = Error & {
  stage?: 'node' | 'tag'
  original?: unknown
}

export function errorToString(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function wrapSaveError(stage: 'node' | 'tag', error: unknown): SaveNodeError {
  const wrapped = new Error(errorToString(error)) as SaveNodeError
  wrapped.stage = stage
  wrapped.original = error
  return wrapped
}

export async function createNodeWithTags(options: {
  supabase: SupabaseClient
  userId: string
  payload: NodeWritePayload
  allowPartialTags?: boolean
}): Promise<{ nodeId: string; tagErrors: string[] }> {
  const { supabase, userId, payload, allowPartialTags = false } = options
  const { data: node, error: nodeErr } = await supabase
    .from('nodes')
    .insert({
      owner_id: userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      status: payload.status,
      context: payload.context,
      energy: payload.energy,
      duration_minutes: payload.duration_minutes,
      due_at: payload.due_at,
    })
    .select('id')
    .single()

  if (nodeErr) throw wrapSaveError('node', nodeErr)

  const tagErrors: string[] = []

  for (const name of payload.tags) {
    const { data: tag, error: tagErr } = await supabase
      .from('tags')
      .upsert({ owner_id: userId, name }, { onConflict: 'owner_id,name' })
      .select('id')
      .single()

    if (tagErr) {
      if (allowPartialTags) {
        tagErrors.push(tagErr.message)
        continue
      }
      throw wrapSaveError('tag', tagErr)
    }

    const { error: linkErr } = await supabase
      .from('node_tags')
      .upsert({ node_id: node.id, tag_id: tag.id })

    if (linkErr) {
      if (allowPartialTags) {
        tagErrors.push(linkErr.message)
        continue
      }
      throw wrapSaveError('tag', linkErr)
    }
  }

  return { nodeId: node.id, tagErrors }
}
