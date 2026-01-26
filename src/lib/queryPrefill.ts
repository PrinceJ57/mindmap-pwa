import { mergeTags } from './tagParse'
import type { NodeType } from './nodeWrites'
import { STATUSES, type Status } from '../utils/status'

export const CAPTURE_PREFILL_STORAGE_KEY = 'capture_prefill_query'

export type CapturePrefill = {
  hasPrefill: boolean
  title: string
  body: string
  tags: string[]
  context: string
  type?: NodeType
  status?: Status
  hasBodyText: boolean
}

const PREFILL_KEYS = ['body', 'text', 'title', 'tags', 'context', 'type', 'status'] as const

function normalizeSearch(search: string): string {
  if (!search) return ''
  return search.startsWith('?') ? search.slice(1) : search
}

function decodeValue(value: string): string {
  return value.replace(/\+/g, ' ').trim()
}

function decodeRawValue(value: string): string {
  return value.replace(/\+/g, ' ')
}

export function parsePrefillParams(search: string): CapturePrefill {
  const params = new URLSearchParams(normalizeSearch(search))
  const hasPrefill = PREFILL_KEYS.some((key) => params.has(key))
  if (!hasPrefill) {
    return {
      hasPrefill: false,
      title: '',
      body: '',
      tags: [],
      context: '',
      hasBodyText: false,
    }
  }

  const rawBody = decodeRawValue(params.get('body') ?? '')
  const rawText = decodeRawValue(params.get('text') ?? '')
  const body = rawBody.trim() ? rawBody : rawText
  const title = decodeValue(params.get('title') ?? '')
  const context = decodeValue(params.get('context') ?? '')

  const tagParts = params.getAll('tags').flatMap((value) => decodeValue(value).split(','))
  const hasBodyText = Boolean(body.trim())
  const tags = mergeTags(tagParts, hasBodyText ? ['dictated'] : [])

  const rawType = decodeValue(params.get('type') ?? '').toLowerCase()
  const type: NodeType | undefined = rawType === 'idea' || rawType === 'task' ? rawType : undefined

  const rawStatus = decodeValue(params.get('status') ?? '').toLowerCase()
  const statusCandidate = rawStatus as Status
  const status = STATUSES.includes(statusCandidate) ? statusCandidate : undefined

  return {
    hasPrefill,
    title,
    body,
    tags,
    context,
    type,
    status,
    hasBodyText,
  }
}
