import { STATUSES, type Status } from '../utils/status'
import type { NodeType } from './nodeWrites'

export type QuickAddParseResult = {
  title: string
  tags: string[]
  context?: string
  status?: Status
  type?: NodeType
  due_at?: string
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[.,;:!?]+$/g, '')
}

function normalizeTag(raw: string): string {
  return stripTrailingPunctuation(raw.trim().toLowerCase())
}

function normalizeTokenValue(raw: string): string {
  return stripTrailingPunctuation(raw.trim())
}

function isValidDueDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function parseQuickAdd(input: string): QuickAddParseResult {
  const tokens = input.trim().split(/\s+/).filter(Boolean)
  const tags: string[] = []
  const titleParts: string[] = []
  let context: string | undefined
  let status: Status | undefined
  let type: NodeType | undefined
  let due_at: string | undefined

  for (const token of tokens) {
    const lower = token.toLowerCase()

    if (lower.startsWith('#') && token.length > 1) {
      const tag = normalizeTag(token.slice(1))
      if (tag) tags.push(tag)
      continue
    }

    if (lower.startsWith('@') && token.length > 1 && !context) {
      const nextContext = normalizeTokenValue(token.slice(1))
      if (nextContext) context = nextContext
      continue
    }

    if (lower.startsWith('!') && token.length > 1) {
      const candidate = normalizeTokenValue(lower.slice(1))
      if ((STATUSES as readonly string[]).includes(candidate)) {
        status = candidate as Status
        continue
      }
    }

    if (lower.startsWith('type:')) {
      const candidate = normalizeTokenValue(lower.slice(5))
      if (candidate === 'idea' || candidate === 'task') {
        type = candidate
        continue
      }
    }

    if (lower.startsWith('due:')) {
      const candidate = normalizeTokenValue(token.slice(4))
      if (isValidDueDate(candidate)) {
        due_at = candidate
        continue
      }
    }

    titleParts.push(token)
  }

  const uniqueTags = Array.from(new Set(tags))

  return {
    title: titleParts.join(' ').trim(),
    tags: uniqueTags,
    ...(context ? { context } : {}),
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(due_at ? { due_at } : {}),
  }
}
