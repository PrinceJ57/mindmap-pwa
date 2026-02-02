import { normalizeTag } from '../utils/tagUtils'

export type SuggestionRelation = 'depends_on' | 'related'

export type SuggestionNode = {
  id: number
  title: string
  body?: string | null
  status: string
  type: string
  tags?: string[] | null
}

export type EdgeSuggestion = {
  id: number
  title: string
  status: string
  type: string
  tags: string[]
  relation: SuggestionRelation
  score: number
  reasons: string[]
}

const STOPWORDS = new Set([
  'the', 'and', 'that', 'this', 'with', 'from', 'your', 'you', 'for', 'are', 'was', 'were', 'will', 'what',
  'when', 'where', 'which', 'then', 'than', 'them', 'they', 'their', 'there', 'these', 'those', 'have', 'has',
  'had', 'not', 'but', 'can', 'could', 'should', 'would', 'about', 'into', 'over', 'under', 'after', 'before',
  'while', 'just', 'like', 'need', 'needs', 'make', 'made', 'build', 'develop', 'create', 'plan', 'design',
  'project', 'task', 'idea', 'todo', 'doing', 'done', 'waiting', 'someday', 'inbox', 'active', 'later',
])

const DEPENDENCY_PATTERNS = [
  /depends on\s+([^\n\.]+)/gi,
  /waiting on\s+([^\n\.]+)/gi,
  /blocked by\s+([^\n\.]+)/gi,
  /needs\s+([^\n\.]+)/gi,
  /requires\s+([^\n\.]+)/gi,
  /blocked:\s*([^\n\.]+)/gi,
  /dependency:\s*([^\n\.]+)/gi,
]

const DONE_STATUSES = new Set(['done', 'archived'])

function tokenize(text: string): string[] {
  if (!text) return []
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 3)
    .filter(token => !STOPWORDS.has(token))
}

function uniqueTokens(tokens: string[]) {
  return Array.from(new Set(tokens))
}

function extractHintTokens(text: string): string[] {
  const results: string[] = []
  for (const pattern of DEPENDENCY_PATTERNS) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      const capture = match[1] ?? ''
      const tokens = tokenize(capture).slice(0, 6)
      results.push(...tokens)
    }
  }
  return uniqueTokens(results)
}

function buildTokenSet(title: string, body?: string | null): Set<string> {
  const tokens = uniqueTokens([...tokenize(title), ...tokenize(body ?? '')])
  return new Set(tokens.slice(0, 80))
}

function sharedTokens(a: Set<string>, b: Set<string>): string[] {
  const shared: string[] = []
  for (const token of a) {
    if (b.has(token)) shared.push(token)
  }
  return shared
}

function normalizedTags(tags?: string[] | null) {
  if (!tags) return []
  return tags.map(normalizeTag).filter(Boolean)
}

export function buildSuggestionQuery(node: {
  title: string
  tags?: string[] | null
}) {
  const tokens = uniqueTokens(tokenize(node.title))
  const tagTokens = normalizedTags(node.tags)
  const merged = uniqueTokens([...tokens, ...tagTokens])
  if (merged.length === 0) return null
  return merged.slice(0, 6).join(' ')
}

export function suggestEdges(params: {
  current: SuggestionNode
  candidates: SuggestionNode[]
  existingIds: Set<number>
}): { dependencies: EdgeSuggestion[]; related: EdgeSuggestion[] } {
  const { current, candidates, existingIds } = params
  const currentTags = new Set(normalizedTags(current.tags))
  const currentTokens = buildTokenSet(current.title, current.body)
  const hintTokens = new Set(extractHintTokens(`${current.title}\n${current.body ?? ''}`))

  const dependencySuggestions: EdgeSuggestion[] = []
  const relatedSuggestions: EdgeSuggestion[] = []

  for (const candidate of candidates) {
    if (candidate.id === current.id) continue
    if (existingIds.has(candidate.id)) continue

    const candidateTags = new Set(normalizedTags(candidate.tags))
    const candidateTokens = buildTokenSet(candidate.title, candidate.body)

    const sharedTagList = sharedTokens(currentTags, candidateTags)
    const sharedTokenList = sharedTokens(currentTokens, candidateTokens)
    const sharedHintList = sharedTokens(hintTokens, candidateTokens)

    if (sharedTagList.length === 0 && sharedTokenList.length === 0 && sharedHintList.length === 0) {
      continue
    }

    const scoreTags = sharedTagList.length * 2.8
    const scoreTokens = sharedTokenList.length * 1.3
    const scoreHints = sharedHintList.length * 4.2
    const scoreType = current.type === candidate.type ? 0.4 : 0
    const scoreStatus = current.status === 'waiting' && !DONE_STATUSES.has(candidate.status)
      ? 0.8
      : 0
    const scorePenalty = DONE_STATUSES.has(candidate.status) ? -2.4 : 0

    const score = scoreTags + scoreTokens + scoreHints + scoreType + scoreStatus + scorePenalty
    if (score < 2) continue

    const reasons: string[] = []
    if (sharedTagList.length > 0) {
      reasons.push(`shared tags: ${sharedTagList.slice(0, 3).join(', ')}`)
    }
    if (sharedTokenList.length > 0) {
      reasons.push(`shared terms: ${sharedTokenList.slice(0, 3).join(', ')}`)
    }
    if (sharedHintList.length > 0) {
      reasons.push(`dependency cue: ${sharedHintList.slice(0, 2).join(', ')}`)
    }

    const shouldSuggestDependency =
      (sharedHintList.length > 0)
      || (
        current.status === 'waiting'
        && !DONE_STATUSES.has(candidate.status)
        && (sharedTagList.length >= 1 || sharedTokenList.length >= 2)
      )

    if (shouldSuggestDependency && score >= 4) {
      dependencySuggestions.push({
        id: candidate.id,
        title: candidate.title,
        status: candidate.status,
        type: candidate.type,
        tags: normalizedTags(candidate.tags),
        relation: 'depends_on',
        score,
        reasons,
      })
    } else if (score >= 3) {
      relatedSuggestions.push({
        id: candidate.id,
        title: candidate.title,
        status: candidate.status,
        type: candidate.type,
        tags: normalizedTags(candidate.tags),
        relation: 'related',
        score,
        reasons,
      })
    }
  }

  dependencySuggestions.sort((a, b) => b.score - a.score)
  relatedSuggestions.sort((a, b) => b.score - a.score)

  return {
    dependencies: dependencySuggestions.slice(0, 6),
    related: relatedSuggestions.slice(0, 6),
  }
}
