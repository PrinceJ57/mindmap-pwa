export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase()
}

export function mergeTags(...lists: string[][]): string[] {
  const set = new Set<string>()
  for (const list of lists) {
    for (const raw of list) {
      const tag = normalizeTag(raw)
      if (tag) set.add(tag)
    }
  }
  return Array.from(set)
}

export function extractInlineTags(text: string): string[] {
  const tags: string[] = []
  const pattern = /(^|[^\w/])#([A-Za-z0-9][A-Za-z0-9/_-]*)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const raw = match[2]
    if (!raw) continue
    const cleaned = raw.replace(/\//g, '-').replace(/^-+|-+$/g, '')
    const normalized = normalizeTag(cleaned)
    if (normalized) tags.push(normalized)
  }
  return Array.from(new Set(tags))
}
