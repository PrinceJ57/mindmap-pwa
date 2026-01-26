export type RecentNode = {
  id: number
  title: string
  type: string
  tags: string[]
  lastOpenedAt: string
}

export const RECENT_NODES_STORAGE_KEY = 'mm_recent_nodes_v1'

const MAX_RECENTS = 10

function safeRead(): RecentNode[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_NODES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry): entry is RecentNode => {
        if (!entry || typeof entry !== 'object') return false
        const record = entry as RecentNode
        return (
          typeof record.id === 'number' &&
          typeof record.title === 'string' &&
          typeof record.type === 'string' &&
          Array.isArray(record.tags) &&
          typeof record.lastOpenedAt === 'string'
        )
      })
      .slice(0, MAX_RECENTS)
  } catch {
    return []
  }
}

function safeWrite(entries: RecentNode[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(RECENT_NODES_STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Ignore storage write failures.
  }
}

export function getRecentNodes(): RecentNode[] {
  return safeRead()
}

export function addRecentNode(entry: {
  id: number
  title: string
  type: string
  tags?: string[] | null
}): RecentNode[] {
  const current = safeRead()
  const filtered = current.filter(item => item.id !== entry.id)
  const next: RecentNode = {
    id: entry.id,
    title: entry.title,
    type: entry.type,
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    lastOpenedAt: new Date().toISOString(),
  }
  const updated = [next, ...filtered].slice(0, MAX_RECENTS)
  safeWrite(updated)
  return updated
}
