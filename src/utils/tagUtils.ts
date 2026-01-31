/**
 * Centralized tag utilities
 * All tag normalization should use these functions
 */

/**
 * Strip trailing punctuation from a string
 */
export function stripTrailingPunctuation(value: string): string {
  return value.replace(/[.,;:!?]+$/g, '')
}

/**
 * Normalize a tag: trim, lowercase, strip punctuation
 */
export function normalizeTag(raw: string): string {
  return stripTrailingPunctuation(raw.trim().toLowerCase())
}

/**
 * Normalize a token value: trim and strip punctuation
 */
export function normalizeTokenValue(raw: string): string {
  return stripTrailingPunctuation(raw.trim())
}

/**
 * Check if a date string is valid YYYY-MM-DD format
 */
export function isValidDueDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/**
 * Valid node types
 */
export const NODE_TYPES = ['idea', 'task'] as const
export type NodeType = (typeof NODE_TYPES)[number]

/**
 * Check if a value is a valid node type
 */
export function isValidType(value: string): value is NodeType {
  return (NODE_TYPES as readonly string[]).includes(value)
}
