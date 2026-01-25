export const STATUSES = ['inbox', 'active', 'waiting', 'someday', 'done', 'archived'] as const

export type Status = typeof STATUSES[number]
