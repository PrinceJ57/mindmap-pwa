import { useEffect, useMemo, useRef, useState, type PointerEvent, type RefObject, type WheelEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import {
  filtersToQueryString,
  normalizeViewFilters,
  parseFiltersFromSearchParams,
  type ViewFilters,
} from '../utils/viewFilters'
import { type Status } from '../utils/status'

type NodeRow = {
  id: number
  type: string
  title: string
  status: string
  created_at: string
  updated_at?: string | null
  tags?: string[] | null
}

type DependencyEdgeRow = {
  id: number
  from_node_id: number
  to_node_id: number
  relation: string
  created_at: string
}

type SimNode = {
  id: number
  type: string
  title: string
  status: string
  tags: string[]
  x: number
  y: number
  vx: number
  vy: number
  width: number
  height: number
}

type TagEdge = {
  a: number
  b: number
  tag: string
  color: string
}

type DependencyEdge = {
  id: number
  a: number
  b: number
  relation: string
}

type SimState = {
  nodes: SimNode[]
  tagEdges: TagEdge[]
  dependencyEdges: DependencyEdge[]
  indexById: Map<number, number>
  stableFrames: number
}

type DragState = {
  nodeId: number
  pointerId: number
  offsetX: number
  offsetY: number
  startX: number
  startY: number
  moved: boolean
}

type InteractionState = {
  mode: 'none' | 'pan' | 'pinch' | 'drag'
  start: { x: number; y: number }
  startView: { x: number; y: number; scale: number }
  pointers: Map<number, { x: number; y: number }>
  lastPinchDistance: number
}

const MAX_NODES = 2000
const MAX_EDGES = 6000
const MAX_EDGES_PER_TAG = 120
const MIN_SCALE = 0.35
const MAX_SCALE = 2.8

const STATUS_COLORS: Record<Status, string> = {
  inbox: '#38bdf8',
  active: '#22c55e',
  waiting: '#f59e0b',
  someday: '#a855f7',
  done: '#10b981',
  archived: '#64748b',
}

function normalizeTag(raw: string) {
  return raw.trim().toLowerCase()
}

function tagToColor(tag: string) {
  let hash = 0
  for (let i = 0; i < tag.length; i += 1) {
    hash = (hash << 5) - hash + tag.charCodeAt(i)
    hash |= 0
  }
  const hue = Math.abs(hash) % 360
  return `hsla(${hue}, 70%, 60%, 0.35)`
}

function estimateNodeSize(title: string) {
  const trimmed = title.trim()
  const length = trimmed.length
  const width = Math.min(320, Math.max(120, 70 + length * 7.2))
  const height = 38
  return { width, height }
}

function initialPosition(index: number, seed: number) {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  const angle = (index + seed * 17) * goldenAngle
  const radius = 22 * Math.sqrt(index)
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  }
}

function buildTagEdges(nodes: NodeRow[]) {
  const tagMap = new Map<string, number[]>()
  for (let index = 0; index < nodes.length; index += 1) {
    const tags = nodes[index].tags ?? []
    for (const rawTag of tags) {
      const tag = normalizeTag(rawTag)
      if (!tag) continue
      if (!tagMap.has(tag)) tagMap.set(tag, [])
      tagMap.get(tag)!.push(index)
    }
  }

  const tagCounts = new Map<string, number>()
  for (const [tag, indices] of tagMap.entries()) {
    tagCounts.set(tag, indices.length)
  }

  const tags = Array.from(tagMap.entries())
    .filter(([, indices]) => indices.length > 1)
    .sort((a, b) => b[1].length - a[1].length)

  const edges: TagEdge[] = []
  let truncated = false

  for (const [tag, indices] of tags) {
    const sorted = [...indices].sort((a, b) => a - b)
    const step = Math.max(1, Math.ceil(sorted.length / MAX_EDGES_PER_TAG))
    const sampled = sorted.filter((_, idx) => idx % step === 0)

    const color = tagToColor(tag)
    for (let i = 1; i < sampled.length; i += 1) {
      edges.push({ a: sampled[i - 1], b: sampled[i], tag, color })
      if (edges.length >= MAX_EDGES) {
        truncated = true
        break
      }
    }
    if (truncated) break
  }

  return { edges, tagCounts, truncated }
}

function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setSize({ width, height })
      }
    })

    observer.observe(element)

    return () => observer.disconnect()
  }, [ref])

  return size
}

function summarizeFilters(filters: ViewFilters) {
  const chips: string[] = []
  if (filters.q) chips.push(`q:${filters.q}`)
  if (filters.type) chips.push(`type:${filters.type}`)
  if (filters.statuses && filters.statuses.length > 0) {
    chips.push(`status:${filters.statuses.join(',')}`)
  }
  if (filters.tags && filters.tags.length > 0) {
    chips.push(`tags:${filters.tags.join(',')}`)
  }
  if (filters.pinnedOnly) chips.push('pinned')
  return chips
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function edgePath(a: SimNode, b: SimNode) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const distance = Math.hypot(dx, dy) || 1
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const curve = Math.min(48, distance / 5)
  const cx = mx - (dy / distance) * curve
  const cy = my + (dx / distance) * curve
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
}

function dependencyPath(a: SimNode, b: SimNode) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const distance = Math.hypot(dx, dy) || 1
  const startOffset = Math.max(a.height / 2, 18)
  const endOffset = Math.max(b.height / 2, 18)
  const sx = a.x + (dx / distance) * startOffset
  const sy = a.y + (dy / distance) * startOffset
  const ex = b.x - (dx / distance) * endOffset
  const ey = b.y - (dy / distance) * endOffset

  const mx = (sx + ex) / 2
  const my = (sy + ey) / 2
  const curve = Math.min(64, distance / 4)
  const cx = mx - (dy / distance) * curve
  const cy = my + (dx / distance) * curve
  return `M ${sx.toFixed(2)} ${sy.toFixed(2)} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${ex.toFixed(2)} ${ey.toFixed(2)}`
}

export default function Mindmap() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const filters = useMemo(() => normalizeViewFilters(parseFiltersFromSearchParams(searchParams)), [searchParams])
  const hasFilters = useMemo(() => {
    return !!(
      filters.q
      || filters.type
      || (filters.statuses && filters.statuses.length > 0)
      || (filters.tags && filters.tags.length > 0)
      || filters.pinnedOnly
    )
  }, [filters])
  const filterChips = useMemo(() => summarizeFilters(filters), [filters])

  const [nodes, setNodes] = useState<NodeRow[]>([])
  const [dependencyRows, setDependencyRows] = useState<DependencyEdgeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [dependencyLoading, setDependencyLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [dependencyError, setDependencyError] = useState<string | null>(null)
  const [layoutRunning, setLayoutRunning] = useState(true)
  const [layoutSeed, setLayoutSeed] = useState(0)
  const [renderTick, setRenderTick] = useState(0)
  const [hoveredId, setHoveredId] = useState<number | null>(null)

  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })
  const viewRef = useRef(view)
  useEffect(() => {
    viewRef.current = view
  }, [view])

  const containerRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const size = useElementSize(containerRef)

  const { edges: tagEdges, tagCounts, truncated: tagEdgesTruncated } = useMemo(() => buildTagEdges(nodes), [nodes])

  const dependencyEdges = useMemo<DependencyEdge[]>(() => {
    if (dependencyRows.length === 0 || nodes.length === 0) return []
    const indexById = new Map<number, number>()
    nodes.forEach((node, index) => indexById.set(node.id, index))
    const mapped: DependencyEdge[] = []
    for (const edge of dependencyRows) {
      const fromIndex = indexById.get(edge.from_node_id)
      const toIndex = indexById.get(edge.to_node_id)
      if (fromIndex === undefined || toIndex === undefined) continue
      mapped.push({ id: edge.id, a: fromIndex, b: toIndex, relation: edge.relation })
    }
    return mapped
  }, [dependencyRows, nodes])

  const limitHit = nodes.length >= MAX_NODES

  const simRef = useRef<SimState | null>(null)
  const animationRef = useRef<number | null>(null)
  const layoutRunningRef = useRef(layoutRunning)
  const dragRef = useRef<DragState | null>(null)
  const interactionRef = useRef<InteractionState>({
    mode: 'none',
    start: { x: 0, y: 0 },
    startView: { x: 0, y: 0, scale: 1 },
    pointers: new Map(),
    lastPinchDistance: 0,
  })

  useEffect(() => {
    layoutRunningRef.current = layoutRunning
    if (layoutRunning) {
      ensureAnimation()
    }
  }, [layoutRunning])

  useEffect(() => {
    return () => {
      if (animationRef.current !== null) {
        window.cancelAnimationFrame(animationRef.current)
      }
    }
  }, [])

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setErrorMessage(null)

      const { data, error } = await supabase.rpc('list_nodes', {
        lim: MAX_NODES,
        q: filters.q,
        type_filter: filters.type,
        status_filter: filters.statuses,
        tag_filter: filters.tags,
        pinned_only: filters.pinnedOnly ?? false,
        review_due_only: false,
      })

      if (!active) return

      if (error) {
        setErrorMessage(error.message)
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

    load()

    return () => {
      active = false
    }
  }, [filters])

  useEffect(() => {
    if (nodes.length === 0) {
      setDependencyRows([])
      return
    }
    let active = true

    async function loadDependencies() {
      setDependencyLoading(true)
      setDependencyError(null)

      const nodeIds = nodes.map(node => node.id)
      const { data, error } = await supabase.rpc('list_edges_for_nodes', {
        node_ids: nodeIds,
        relation_filter: 'depends_on',
      })

      if (!active) return

      if (error) {
        setDependencyRows([])
        setDependencyError(error.message)
        setDependencyLoading(false)
        return
      }

      const idSet = new Set(nodeIds)
      const filtered = ((data ?? []) as DependencyEdgeRow[]).filter(edge => (
        idSet.has(edge.from_node_id) && idSet.has(edge.to_node_id)
      ))

      setDependencyRows(filtered)
      setDependencyLoading(false)
    }

    loadDependencies()

    return () => {
      active = false
    }
  }, [nodes])

  useEffect(() => {
    if (nodes.length === 0 || size.width === 0 || size.height === 0) return

    const simNodes = nodes.map((node, index) => {
      const { width, height } = estimateNodeSize(node.title)
      const { x, y } = initialPosition(index, layoutSeed)
      return {
        id: node.id,
        type: node.type,
        title: node.title,
        status: node.status,
        tags: node.tags ?? [],
        x,
        y,
        vx: 0,
        vy: 0,
        width,
        height,
      }
    })

    const indexById = new Map<number, number>()
    simNodes.forEach((node, index) => indexById.set(node.id, index))

    simRef.current = {
      nodes: simNodes,
      tagEdges,
      dependencyEdges,
      indexById,
      stableFrames: 0,
    }

    setLayoutRunning(true)
    ensureAnimation()
    setRenderTick(prev => prev + 1)
    window.setTimeout(() => {
      fitToView()
    }, 0)
  }, [nodes, tagEdges, dependencyEdges, size.width, size.height, layoutSeed])

  function ensureAnimation() {
    if (animationRef.current !== null) return
    animationRef.current = window.requestAnimationFrame(step)
  }

  function step() {
    animationRef.current = null
    const sim = simRef.current
    if (!sim) return

    const shouldRun = layoutRunningRef.current
    if (!shouldRun) return
    const dragging = dragRef.current

    const { nodes: simNodes, tagEdges: simTagEdges, dependencyEdges: simDependencyEdges } = sim
    const count = simNodes.length

    if (count === 0) return

    const repulsion = count > 900 ? 2500 : count > 500 ? 3800 : 6200
    const centerStrength = count > 900 ? 0.00035 : 0.0006
    const tagEdgeStrength = count > 900 ? 0.0009 : 0.0015
    const dependencyStrength = count > 900 ? 0.0032 : 0.005
    const damping = 0.84
    const maxVelocity = 6

    const stepSize = count > 320 ? Math.ceil(count / 300) : 1

    for (let i = 0; i < count; i += 1) {
      const a = simNodes[i]
      for (let j = i + 1; j < count; j += stepSize) {
        const b = simNodes[j]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const distance2 = dx * dx + dy * dy + 0.01
        const distance = Math.sqrt(distance2)
        const minDist = (a.width + b.width) * 0.55 + 24
        const force = repulsion / distance2
        const fx = (dx / distance) * force
        const fy = (dy / distance) * force
        a.vx -= fx
        a.vy -= fy
        b.vx += fx
        b.vy += fy

        if (distance < minDist) {
          const overlap = (minDist - distance) / distance
          const push = overlap * 0.5
          a.vx -= dx * push
          a.vy -= dy * push
          b.vx += dx * push
          b.vy += dy * push
        }
      }
    }

    for (const edge of simTagEdges) {
      const a = simNodes[edge.a]
      const b = simNodes[edge.b]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const distance = Math.hypot(dx, dy) || 1
      const target = (a.width + b.width) * 0.65 + 36
      const delta = distance - target
      const force = delta * tagEdgeStrength
      const fx = (dx / distance) * force
      const fy = (dy / distance) * force
      a.vx += fx
      a.vy += fy
      b.vx -= fx
      b.vy -= fy
    }

    for (const edge of simDependencyEdges) {
      const a = simNodes[edge.a]
      const b = simNodes[edge.b]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const distance = Math.hypot(dx, dy) || 1
      const target = (a.width + b.width) * 0.5 + 24
      const delta = distance - target
      const force = delta * dependencyStrength
      const fx = (dx / distance) * force
      const fy = (dy / distance) * force
      a.vx += fx
      a.vy += fy
      b.vx -= fx
      b.vy -= fy
    }

    let totalSpeed = 0

    for (let i = 0; i < count; i += 1) {
      const node = simNodes[i]
      if (dragging && dragging.nodeId === node.id) {
        node.vx = 0
        node.vy = 0
        continue
      }
      node.vx += -node.x * centerStrength
      node.vy += -node.y * centerStrength
      node.vx *= damping
      node.vy *= damping
      node.vx = clamp(node.vx, -maxVelocity, maxVelocity)
      node.vy = clamp(node.vy, -maxVelocity, maxVelocity)
      node.x += node.vx
      node.y += node.vy
      totalSpeed += Math.abs(node.vx) + Math.abs(node.vy)
    }

    if (shouldRun) {
      const avgSpeed = totalSpeed / count
      if (avgSpeed < 0.04) {
        sim.stableFrames += 1
      } else {
        sim.stableFrames = 0
      }
      if (sim.stableFrames > 45) {
        layoutRunningRef.current = false
        setLayoutRunning(false)
      }
    }

    setRenderTick(prev => prev + 1)
    ensureAnimation()
  }

  function fitToView() {
    const sim = simRef.current
    if (!sim || size.width === 0 || size.height === 0) return

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity

    for (const node of sim.nodes) {
      const halfW = node.width / 2
      const halfH = node.height / 2
      minX = Math.min(minX, node.x - halfW)
      maxX = Math.max(maxX, node.x + halfW)
      minY = Math.min(minY, node.y - halfH)
      maxY = Math.max(maxY, node.y + halfH)
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return

    const padding = 80
    const boundsWidth = maxX - minX + padding * 2
    const boundsHeight = maxY - minY + padding * 2

    const scale = clamp(Math.min(size.width / boundsWidth, size.height / boundsHeight), MIN_SCALE, MAX_SCALE)
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2

    setView({
      scale,
      x: size.width / 2 - centerX * scale,
      y: size.height / 2 - centerY * scale,
    })
  }

  function resetLayout() {
    setLayoutSeed(prev => prev + 1)
  }

  function toggleLayout() {
    setLayoutRunning(prev => !prev)
  }

  function screenToWorld(clientX: number, clientY: number) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    const current = viewRef.current
    return {
      x: (clientX - rect.left - current.x) / current.scale,
      y: (clientY - rect.top - current.y) / current.scale,
    }
  }

  function zoomAt(clientX: number, clientY: number, nextScale: number) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const world = screenToWorld(clientX, clientY)
    setView({
      scale: nextScale,
      x: clientX - rect.left - world.x * nextScale,
      y: clientY - rect.top - world.y * nextScale,
    })
  }

  function handleWheel(event: WheelEvent<SVGSVGElement>) {
    event.preventDefault()
    const direction = event.deltaY > 0 ? -1 : 1
    const zoom = direction > 0 ? 1.08 : 0.92
    const current = viewRef.current
    const nextScale = clamp(current.scale * zoom, MIN_SCALE, MAX_SCALE)
    zoomAt(event.clientX, event.clientY, nextScale)
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return
    const interaction = interactionRef.current
    interaction.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (interaction.pointers.size === 1) {
      interaction.mode = 'pan'
      interaction.start = { x: event.clientX, y: event.clientY }
      interaction.startView = { ...viewRef.current }
    } else if (interaction.pointers.size === 2) {
      interaction.mode = 'pinch'
      const points = Array.from(interaction.pointers.values())
      const dx = points[1].x - points[0].x
      const dy = points[1].y - points[0].y
      interaction.lastPinchDistance = Math.hypot(dx, dy)
    }

    svgRef.current?.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const interaction = interactionRef.current

    if (dragRef.current && dragRef.current.pointerId === event.pointerId) {
      const sim = simRef.current
      if (!sim) return
      const index = sim.indexById.get(dragRef.current.nodeId)
      if (index === undefined) return
      const node = sim.nodes[index]
      const world = screenToWorld(event.clientX, event.clientY)
      node.x = world.x + dragRef.current.offsetX
      node.y = world.y + dragRef.current.offsetY
      node.vx = 0
      node.vy = 0

      if (!dragRef.current.moved) {
        const dx = event.clientX - dragRef.current.startX
        const dy = event.clientY - dragRef.current.startY
        if (Math.hypot(dx, dy) > 4) {
          dragRef.current.moved = true
        }
      }

      setRenderTick(prev => prev + 1)
      return
    }

    if (!interaction.pointers.has(event.pointerId)) return
    interaction.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (interaction.mode === 'pan' && interaction.pointers.size === 1) {
      const dx = event.clientX - interaction.start.x
      const dy = event.clientY - interaction.start.y
      setView({
        ...interaction.startView,
        x: interaction.startView.x + dx,
        y: interaction.startView.y + dy,
      })
    }

    if (interaction.mode === 'pinch' && interaction.pointers.size >= 2) {
      const points = Array.from(interaction.pointers.values())
      const dx = points[1].x - points[0].x
      const dy = points[1].y - points[0].y
      const distance = Math.hypot(dx, dy)
      if (interaction.lastPinchDistance > 0) {
        const scaleFactor = distance / interaction.lastPinchDistance
        const current = viewRef.current
        const nextScale = clamp(current.scale * scaleFactor, MIN_SCALE, MAX_SCALE)
        const centerX = (points[0].x + points[1].x) / 2
        const centerY = (points[0].y + points[1].y) / 2
        zoomAt(centerX, centerY, nextScale)
      }
      interaction.lastPinchDistance = distance
    }
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>) {
    const interaction = interactionRef.current

    if (dragRef.current && dragRef.current.pointerId === event.pointerId) {
      const dragged = dragRef.current
      dragRef.current = null
      interaction.mode = 'none'
      if (!dragged.moved) {
        navigate(`/node/${dragged.nodeId}`)
      }
    }

    interaction.pointers.delete(event.pointerId)
    if (interaction.pointers.size === 0) {
      interaction.mode = 'none'
    } else if (interaction.pointers.size === 1 && interaction.mode === 'pinch') {
      const [point] = interaction.pointers.values()
      interaction.mode = 'pan'
      interaction.start = { x: point.x, y: point.y }
      interaction.startView = { ...viewRef.current }
    }

    svgRef.current?.releasePointerCapture(event.pointerId)
  }

  function handlePointerCancel(event: PointerEvent<SVGSVGElement>) {
    interactionRef.current.pointers.delete(event.pointerId)
    if (dragRef.current && dragRef.current.pointerId === event.pointerId) {
      dragRef.current = null
    }
    svgRef.current?.releasePointerCapture(event.pointerId)
  }

  function handleNodePointerDown(event: PointerEvent<SVGGElement>, nodeId: number) {
    if (event.button !== 0) return
    event.stopPropagation()
    const sim = simRef.current
    if (!sim) return
    const index = sim.indexById.get(nodeId)
    if (index === undefined) return
    const node = sim.nodes[index]
    const world = screenToWorld(event.clientX, event.clientY)
    dragRef.current = {
      nodeId,
      pointerId: event.pointerId,
      offsetX: node.x - world.x,
      offsetY: node.y - world.y,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    }
    interactionRef.current.mode = 'drag'
    svgRef.current?.setPointerCapture(event.pointerId)
    ensureAnimation()
  }

  const { simNodes, indexById } = useMemo(() => ({
    simNodes: simRef.current?.nodes ?? [],
    indexById: simRef.current?.indexById,
  }), [renderTick])
  const activeIndex = hoveredId && indexById ? indexById.get(hoveredId) : undefined
  const activeTags = activeIndex !== undefined ? new Set(simNodes[activeIndex]?.tags ?? []) : null

  return (
    <div className="stack mindmapPage">
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div className="stack-sm">
          <h2>Mindmap</h2>
          <span className="muted" style={{ fontSize: 12 }}>
            {nodes.length} nodes · {dependencyEdges.length} dependencies · {tagCounts.size} tags · {tagEdges.length} tag links
            {limitHit ? ` · showing first ${MAX_NODES}` : ''}
            {tagEdgesTruncated ? ' · lines capped' : ''}
            {dependencyLoading ? ' · loading dependencies…' : ''}
            {dependencyError ? ' · dependencies unavailable' : ''}
          </span>
        </div>
        <div className="row row--wrap">
          <Link to={`/outline${filtersToQueryString(filters)}`} className="button button--ghost">
            Open Outline
          </Link>
          <button type="button" onClick={fitToView} className="button button--ghost">
            Fit
          </button>
          <button type="button" onClick={resetLayout} className="button button--ghost">
            Reflow
          </button>
          <button type="button" onClick={toggleLayout} className="button button--ghost">
            {layoutRunning ? 'Pause layout' : 'Resume layout'}
          </button>
        </div>
      </div>

      {hasFilters && (
        <div className="card mindmapFilters">
          <div className="row row--wrap" style={{ justifyContent: 'space-between' }}>
            <div className="row row--wrap">
              <span className="muted" style={{ fontSize: 12 }}>Filtered from Outline:</span>
              {filterChips.map(chip => (
                <span key={chip} className="chip chip--compact">{chip}</span>
              ))}
            </div>
            <Link to={`/outline${filtersToQueryString(filters)}`} className="button button--ghost">
              Edit filters
            </Link>
          </div>
        </div>
      )}

      <div className="mindmapCanvas" ref={containerRef}>
        {loading && (
          <div className="mindmapOverlay">
            <span className="muted">Loading mindmap…</span>
          </div>
        )}
        {errorMessage && (
          <div className="mindmapOverlay" style={{ color: '#f87171' }}>
            {errorMessage}
          </div>
        )}
        {!loading && !errorMessage && nodes.length === 0 && (
          <div className="mindmapOverlay">
            <span className="muted">No nodes found.</span>
          </div>
        )}

        <svg
          ref={svgRef}
          className={`mindmapSvg${interactionRef.current.mode === 'pan' ? ' mindmapSvg--panning' : ''}`}
          width="100%"
          height="100%"
          viewBox={`0 0 ${Math.max(size.width, 1)} ${Math.max(size.height, 1)}`}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          <defs>
            <filter id="nodeShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="rgba(0,0,0,0.45)" />
            </filter>
            <linearGradient id="nodeGlow" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
            <marker
              id="arrowHead"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(148, 163, 184, 0.7)" />
            </marker>
            <marker
              id="arrowHeadActive"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
            </marker>
          </defs>

          <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
            <g className="mindmapDepEdges" pointerEvents="none">
              {dependencyEdges.map(edge => {
                const a = simNodes[edge.a]
                const b = simNodes[edge.b]
                if (!a || !b) return null
                const isActive = activeIndex !== undefined && (edge.a === activeIndex || edge.b === activeIndex)
                return (
                  <path
                    key={`dep-${edge.id}`}
                    d={dependencyPath(a, b)}
                    className={`mindmapDepEdge${isActive ? ' mindmapDepEdge--active' : ''}`}
                    markerEnd={`url(#${isActive ? 'arrowHeadActive' : 'arrowHead'})`}
                    vectorEffect="non-scaling-stroke"
                  />
                )
              })}
            </g>
            <g className="mindmapEdges" pointerEvents="none">
              {tagEdges.map((edge, index) => {
                const a = simNodes[edge.a]
                const b = simNodes[edge.b]
                if (!a || !b) return null
                const isActive = activeTags
                  ? activeTags.has(edge.tag) && activeIndex !== undefined && (edge.a === activeIndex || edge.b === activeIndex)
                  : false
                return (
                  <path
                    key={`${edge.tag}-${index}`}
                    d={edgePath(a, b)}
                    className={`mindmapEdge${isActive ? ' mindmapEdge--active' : ''}`}
                    stroke={edge.color}
                    vectorEffect="non-scaling-stroke"
                  />
                )
              })}
            </g>

            <g className="mindmapNodes">
              {simNodes.map(node => {
                const statusColor = STATUS_COLORS[node.status as Status] ?? 'var(--border)'
                const label = node.title.length > 48 ? `${node.title.slice(0, 48)}…` : node.title
                const isActive = hoveredId === node.id
                return (
                  <g
                    key={node.id}
                    className={`mindmapNode${isActive ? ' mindmapNode--active' : ''}`}
                    transform={`translate(${(node.x - node.width / 2).toFixed(2)} ${(node.y - node.height / 2).toFixed(2)})`}
                    onPointerDown={(event) => handleNodePointerDown(event, node.id)}
                    onMouseEnter={() => setHoveredId(node.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onFocus={() => setHoveredId(node.id)}
                    onBlur={() => setHoveredId(null)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        navigate(`/node/${node.id}`)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <rect
                      width={node.width}
                      height={node.height}
                      rx={node.height / 2}
                      ry={node.height / 2}
                      fill="rgba(15, 23, 42, 0.95)"
                      stroke={isActive ? 'var(--accent)' : statusColor}
                      strokeWidth={1.2}
                      filter="url(#nodeShadow)"
                    />
                    <rect
                      width={node.width}
                      height={node.height}
                      rx={node.height / 2}
                      ry={node.height / 2}
                      fill="url(#nodeGlow)"
                    />
                    <circle cx={16} cy={node.height / 2} r={4} fill={statusColor} />
                    <text
                      x={node.width / 2 + 6}
                      y={node.height / 2 + 4}
                      textAnchor="middle"
                      className="mindmapNodeLabel"
                    >
                      {label}
                    </text>
                  </g>
                )
              })}
            </g>
          </g>
        </svg>

        <div className="mindmapHud">
          <div className="mindmapHudTitle">Controls</div>
          <div className="mindmapHudText">Arrows = dependencies</div>
          <div className="mindmapHudText">Thin lines = tags</div>
          <div className="mindmapHudText">Drag canvas to pan</div>
          <div className="mindmapHudText">Scroll / pinch to zoom</div>
          <div className="mindmapHudText">Drag a node to reposition</div>
          <div className="mindmapHudText">Tap a node to open</div>
        </div>
      </div>
    </div>
  )
}
