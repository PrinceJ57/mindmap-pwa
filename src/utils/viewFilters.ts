import type { Status } from './status'

export type ViewSort = 'updated' | 'created' | 'relevance'

export type ViewFilters = {
  q: string | null
  type: 'idea' | 'task' | null
  statuses: Status[] | null
  tags: string[] | null
  pinnedOnly: boolean | null
  sort: ViewSort | null
}

const SORT_VALUES: ViewSort[] = ['updated', 'created', 'relevance']
const TYPE_VALUES = ['idea', 'task'] as const

function normalizeTag(raw: string) {
  return raw.trim().toLowerCase()
}

function normalizeStatuses(raw: string[] | null | undefined) {
  if (!raw || raw.length === 0) return null
  const set = new Set<Status>()
  for (const entry of raw) {
    const value = entry.trim().toLowerCase() as Status
    if (value) set.add(value)
  }
  return set.size > 0 ? Array.from(set) : null
}

function normalizeTags(raw: string[] | null | undefined) {
  if (!raw || raw.length === 0) return null
  const set = new Set<string>()
  for (const entry of raw) {
    const value = normalizeTag(entry)
    if (value) set.add(value)
  }
  return set.size > 0 ? Array.from(set) : null
}

export function parseFiltersFromSearchParams(params: URLSearchParams): ViewFilters {
  const q = params.get('q')?.trim() || null
  const typeRaw = params.get('type')?.trim().toLowerCase() || null
  const type = TYPE_VALUES.includes(typeRaw as typeof TYPE_VALUES[number])
    ? (typeRaw as 'idea' | 'task')
    : null

  const statusesRaw = params.get('statuses')
  const statuses = normalizeStatuses(statusesRaw ? statusesRaw.split(',') : null)

  const tagsRaw = params.get('tags')
  const tags = normalizeTags(tagsRaw ? tagsRaw.split(',') : null)

  const pinnedOnlyRaw = params.get('pinnedOnly')
  const pinnedOnly = pinnedOnlyRaw === '1' || pinnedOnlyRaw === 'true' ? true : null

  const sortRaw = params.get('sort')?.trim().toLowerCase() || null
  const sort = SORT_VALUES.includes(sortRaw as ViewSort) ? (sortRaw as ViewSort) : null

  return {
    q,
    type,
    statuses,
    tags,
    pinnedOnly,
    sort,
  }
}

export function normalizeViewFilters(input: Partial<ViewFilters>): ViewFilters {
  const q = input.q?.trim() || null
  const type = input.type ?? null
  const statuses = normalizeStatuses(input.statuses)
  const tags = normalizeTags(input.tags)
  const pinnedOnly = input.pinnedOnly ? true : null
  const sort = input.sort ?? null

  return { q, type, statuses, tags, pinnedOnly, sort }
}

export function filtersToSearchParams(filters: ViewFilters): URLSearchParams {
  const params = new URLSearchParams()

  if (filters.q) params.set('q', filters.q)
  if (filters.type) params.set('type', filters.type)
  if (filters.statuses && filters.statuses.length > 0) {
    params.set('statuses', filters.statuses.join(','))
  }
  if (filters.tags && filters.tags.length > 0) {
    params.set('tags', filters.tags.join(','))
  }
  if (filters.pinnedOnly) params.set('pinnedOnly', '1')
  if (filters.sort) params.set('sort', filters.sort)

  return params
}

export function filtersToQueryString(filters: ViewFilters): string {
  const params = filtersToSearchParams(filters)
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function areFiltersEqual(a: ViewFilters, b: ViewFilters): boolean {
  return filtersToSearchParams(a).toString() === filtersToSearchParams(b).toString()
}
