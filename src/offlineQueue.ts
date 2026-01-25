import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createNodeWithTags,
  errorToString,
  type NodeType,
  type Energy,
  type NodeWritePayload,
  type SaveNodeError,
} from './lib/nodeWrites'

export type OfflinePayload = NodeWritePayload

export type OfflineQueueItem = {
  id: string
  createdAt: number
  payload: OfflinePayload
  lastError?: string
  attempts: number
}

const STORAGE_KEY = 'mm_offline_queue_v1'
const QUEUE_EVENT = 'mm_offline_queue_updated'

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
}

function emitQueueUpdate() {
  if (!isBrowser()) return
  window.dispatchEvent(new Event(QUEUE_EVENT))
}

function readQueue(): OfflineQueueItem[] {
  if (!isBrowser()) return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isQueueItem)
  } catch {
    return []
  }
}

function writeQueue(items: OfflineQueueItem[]) {
  if (!isBrowser()) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  emitQueueUpdate()
}

function isQueueItem(value: unknown): value is OfflineQueueItem {
  if (!value || typeof value !== 'object') return false
  const item = value as OfflineQueueItem
  return typeof item.id === 'string' && typeof item.createdAt === 'number' && typeof item.attempts === 'number'
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function isValidationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: string }).code
  if (!code) return false
  const validationCodes = new Set(['23502', '23514', '22P02', '22001'])
  return validationCodes.has(code)
}

export function shouldQueueError(error: unknown): boolean {
  if (!error) return false
  if (isValidationError(error)) return false

  const message = errorToString(error).toLowerCase()
  if (message.includes('failed to fetch') || message.includes('network') || message.includes('offline')) {
    return true
  }

  const status = (error as { status?: number }).status
  if (typeof status === 'number' && status >= 500) return true

  return true
}

export function getQueue(): OfflineQueueItem[] {
  return readQueue()
}

export function getQueueCount(): number {
  return readQueue().length
}

export function enqueuePayload(payload: OfflinePayload, lastError?: string): OfflineQueueItem {
  const items = readQueue()
  const item: OfflineQueueItem = {
    id: generateId(),
    createdAt: Date.now(),
    payload,
    attempts: 0,
    ...(lastError ? { lastError } : {}),
  }
  items.push(item)
  writeQueue(items)
  return item
}

export function onQueueUpdate(handler: () => void): () => void {
  if (!isBrowser()) return () => {}
  const wrapped = () => handler()
  window.addEventListener(QUEUE_EVENT, wrapped)
  window.addEventListener('storage', wrapped)
  return () => {
    window.removeEventListener(QUEUE_EVENT, wrapped)
    window.removeEventListener('storage', wrapped)
  }
}

export { createNodeWithTags, errorToString, type NodeType, type Energy, type SaveNodeError }

export async function syncOfflineQueue(options: {
  supabase: SupabaseClient
  maxItems?: number
}): Promise<{ attempted: number; synced: number; remaining: number }> {
  const { supabase, maxItems = 3 } = options
  const session = (await supabase.auth.getSession()).data.session
  if (!session) {
    return { attempted: 0, synced: 0, remaining: getQueueCount() }
  }

  const items = readQueue()
  if (items.length === 0) {
    return { attempted: 0, synced: 0, remaining: 0 }
  }

  let attempted = 0
  let synced = 0
  let queue = items.slice()

  for (const item of items) {
    if (attempted >= maxItems) break
    attempted += 1
    try {
      const result = await createNodeWithTags({
        supabase,
        userId: session.user.id,
        payload: item.payload,
        allowPartialTags: true,
      })

      if (result.tagErrors.length > 0) {
        console.warn('Offline sync: tag errors while saving node', result.nodeId, result.tagErrors)
      }

      queue = queue.filter((queued) => queued.id !== item.id)
      synced += 1
    } catch (error) {
      const message = errorToString(error)
      queue = queue.map((queued) =>
        queued.id === item.id
          ? {
              ...queued,
              attempts: queued.attempts + 1,
              lastError: message,
            }
          : queued
      )
    }
  }

  writeQueue(queue)
  return { attempted, synced, remaining: queue.length }
}
