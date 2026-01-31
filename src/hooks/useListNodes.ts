import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { normalizeTag } from '../utils/tagUtils'

export type NodeRow = {
  id: number
  type: string
  title: string
  body: string | null
  status: string
  created_at: string
  updated_at?: string | null
  pinned?: boolean | null
  review_after?: string | null
  tags?: string[] | null
}

export type ListNodesFilters = {
  limit?: number
  q?: string | null
  typeFilter?: string | null
  statusFilter?: string[] | null
  tagFilter?: string[] | null
  pinnedOnly?: boolean
  reviewDueOnly?: boolean
}

/**
 * Hook for fetching nodes using the list_nodes RPC.
 * Handles loading state, error handling, and tag normalization.
 */
export function useListNodes(filters: ListNodesFilters = {}) {
  const [nodes, setNodes] = useState<NodeRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    limit = 100,
    q = null,
    typeFilter = null,
    statusFilter = null,
    tagFilter = null,
    pinnedOnly = false,
    reviewDueOnly = false,
  } = filters

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase.rpc('list_nodes', {
      lim: limit,
      q: q?.trim() || null,
      type_filter: typeFilter,
      status_filter: statusFilter,
      tag_filter: tagFilter,
      pinned_only: pinnedOnly,
      review_due_only: reviewDueOnly,
    })

    if (fetchError) {
      setError(fetchError.message)
      setNodes([])
      setLoading(false)
      return
    }

    const normalized = ((data ?? []) as NodeRow[]).map(row => ({
      ...row,
      tags: Array.isArray(row.tags) ? row.tags.map(normalizeTag) : [],
    }))

    setNodes(normalized)
    setLoading(false)
  }, [limit, q, typeFilter, statusFilter, tagFilter, pinnedOnly, reviewDueOnly])

  // Auto-fetch when filters change
  useEffect(() => {
    let active = true

    const run = async () => {
      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase.rpc('list_nodes', {
        lim: limit,
        q: q?.trim() || null,
        type_filter: typeFilter,
        status_filter: statusFilter,
        tag_filter: tagFilter,
        pinned_only: pinnedOnly,
        review_due_only: reviewDueOnly,
      })

      if (!active) return

      if (fetchError) {
        setError(fetchError.message)
        setNodes([])
        setLoading(false)
        return
      }

      const normalized = ((data ?? []) as NodeRow[]).map(row => ({
        ...row,
        tags: Array.isArray(row.tags) ? row.tags.map(normalizeTag) : [],
      }))

      setNodes(normalized)
      setLoading(false)
    }

    run()
    return () => { active = false }
  }, [limit, q, typeFilter, statusFilter, tagFilter, pinnedOnly, reviewDueOnly])

  return {
    nodes,
    setNodes,
    loading,
    error,
    refetch: fetch,
  }
}
