import { useState, useCallback } from 'react'
import { normalizeTag } from '../utils/tagUtils'

/**
 * Hook for managing a list of tag filters.
 * Handles normalization, deduplication, and common operations.
 */
export function useTagFilter(initial: string[] = []) {
  const [tags, setTags] = useState<string[]>(initial)

  const addTag = useCallback((raw: string) => {
    const tag = normalizeTag(raw)
    if (!tag) return
    setTags(prev => (prev.includes(tag) ? prev : [...prev, tag]))
  }, [])

  const removeTag = useCallback((tag: string) => {
    setTags(prev => prev.filter(t => t !== tag))
  }, [])

  const clearTags = useCallback(() => {
    setTags([])
  }, [])

  const toggleTag = useCallback((raw: string) => {
    const tag = normalizeTag(raw)
    if (!tag) return
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }, [])

  return {
    tags,
    setTags,
    addTag,
    removeTag,
    clearTags,
    toggleTag,
  }
}
