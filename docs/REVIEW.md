# Mindmap PWA - Comprehensive Code Review

> Review Date: January 2026
> Codebase: ~5,350 lines TypeScript across 23 source files

---

## Executive Summary

Mindmap PWA is a well-structured, mobile-first React + Supabase progressive web app focused on fast idea/task capture. The codebase is lean with minimal dependencies, good TypeScript coverage, and solid offline-first capabilities.

However, there are significant opportunities to:
- **Reduce code by ~20%** through deduplication and hook extraction
- **Improve maintainability** by splitting large components
- **Enhance UX** with better feedback patterns and accessibility
- **Add strategic features** without bloating the codebase

---

## Table of Contents

1. [Usability Recommendations](#1-usability-recommendations)
2. [Feature Additions](#2-feature-additions)
3. [Code Simplification Plan](#3-code-simplification-plan)
4. [Efficiency Improvements](#4-efficiency-improvements)
5. [Implementation Priorities](#5-implementation-priorities)

---

## 1. Usability Recommendations

### 1.1 Replace `alert()` with Toast Notifications

**Problem:** `Board.tsx` and `Search.tsx` use browser `alert()` for errors, which:
- Blocks the UI thread
- Looks unprofessional on mobile
- Disrupts user flow

**Solution:** Create a lightweight toast component (already partially exists with `saveMessage` pattern in Capture.tsx).

**Files affected:**
- `src/pages/Board.tsx:75` - error alert
- `src/pages/Search.tsx:102` - error alert

---

### 1.2 Consistent Loading States

**Problem:** Loading states are inconsistent across pages:
- Some show "Loading…" text
- Some show nothing
- No visual skeleton or spinner

**Solution:** Create a shared `<LoadingSpinner />` component and use consistently.

---

### 1.3 Unsaved Changes Warning

**Problem:** `NodeDetail.tsx` allows navigation away without warning when form has unsaved changes.

**Solution:** Add `beforeunload` listener and/or React Router's `useBlocker` when form is dirty.

---

### 1.4 Better Empty States

**Problem:** Empty lists show minimal feedback (e.g., "No results" text only).

**Solution:** Add illustrated empty states with action suggestions:
- Search: "No results found. Try different keywords or clear filters"
- Board columns: "No items in this status"
- Review: "Nothing due! You're all caught up"

---

### 1.5 Keyboard Accessibility Improvements

**Problem:** Some interactive elements lack proper keyboard support:
- Drag-drop on Board (mouse-only)
- Some click handlers don't have keyboard equivalents

**Solution:**
- Add keyboard shortcuts for common Board actions (arrow keys to move items)
- Ensure all clickable elements are focusable

---

### 1.6 Form Validation Feedback

**Problem:** Capture validation shows errors below the form after submission attempt.

**Solution:**
- Inline validation with visual indicators (red border on invalid fields)
- Real-time validation as user types (debounced)

---

### 1.7 Mobile Touch Improvements

**Current State:** Good mobile-first CSS, but some touch targets are small.

**Recommendations:**
- Ensure all touch targets are minimum 44x44px
- Add haptic feedback hints for iOS (where supported)
- Improve swipe gestures on Board (currently drag-only)

---

## 2. Feature Additions

### 2.1 High-Value, Low-Effort Features

#### 2.1.1 Dark/Light Theme Toggle
- CSS variables are already in place
- Add toggle in nav or settings
- Store preference in localStorage
- ~50 lines of code

#### 2.1.2 Keyboard Shortcuts Help Modal
- `?` key opens shortcuts reference
- Already have `SHORTCUTS.md` content
- ~30 lines of code

#### 2.1.3 Undo for Quick Actions
- After "Done" / "Archive" / "Pin", show undo toast
- 5-second timeout before committing
- ~40 lines per action

#### 2.1.4 Bulk Export
- Export filtered Outline results to CSV/JSON
- Leverage existing data fetching
- ~60 lines of code

---

### 2.2 Medium-Effort Features

#### 2.2.1 Recurring Tasks
- Add `recurrence` field (daily/weekly/monthly/custom)
- Auto-recreate when marked done
- ~150 lines + 1 migration

#### 2.2.2 Natural Language Due Dates
- Parse "tomorrow", "next week", "in 3 days"
- Integrate into quick-add syntax
- ~100 lines using simple parsing (no library needed)

#### 2.2.3 Tag Hierarchy/Nesting
- Allow `parent/child` tag syntax
- Filter by parent includes children
- ~200 lines + migration changes

#### 2.2.4 Collaborative Sharing
- Share individual nodes or views via link
- Read-only access for recipients
- ~300 lines + RLS policy changes

---

### 2.3 Features to Avoid (Complexity vs Value)

| Feature | Why Avoid |
|---------|-----------|
| Real-time collaboration | Massive complexity, Supabase realtime setup |
| Rich text editor | Large dependency, complicates data model |
| File attachments | Storage costs, complexity |
| Native mobile app | PWA is sufficient, maintains single codebase |
| AI integrations | Scope creep, requires additional services |

---

## 3. Code Simplification Plan

### 3.1 Eliminate Duplicate Code

#### 3.1.1 Centralize `normalizeTag()` (Save ~80 lines)

**Problem:** Defined in 8 separate files identically.

**Solution:**
```typescript
// src/utils/tagUtils.ts
export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase()
}
```

**Files to update:**
- `src/pages/NodeDetail.tsx:50`
- `src/pages/Outline.tsx:39`
- `src/pages/Board.tsx:25`
- `src/pages/Search.tsx:18`
- `src/pages/Home.tsx:26`
- `src/pages/Review.tsx:28`
- `src/components/CommandPalette.tsx:58`
- `src/components/TagInput.tsx:10`

---

#### 3.1.2 Centralize Validation Helpers (Save ~60 lines)

**Problem:** `normalizeTokenValue`, `isValidDueDate`, `isValidType`, `isValidStatus` duplicated in Capture.tsx and CommandPalette.tsx.

**Solution:** Already defined in `src/lib/quickAddParse.ts` - export and import instead of redefining.

---

#### 3.1.3 Create Shared Data Fetching Hook (Save ~150 lines)

**Problem:** `list_nodes` RPC calls repeated in 6 files with similar error handling.

**Solution:**
```typescript
// src/hooks/useListNodes.ts
export function useListNodes(filters: ListNodesFilters) {
  const [nodes, setNodes] = useState<NodeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.rpc('list_nodes', filters)
    if (error) {
      setError(error.message)
      setNodes([])
    } else {
      setNodes(normalizeNodeRows(data))
    }
    setLoading(false)
  }, [filters])

  return { nodes, loading, error, refetch: fetch }
}
```

---

#### 3.1.4 Create Tag Filter Hook (Save ~40 lines)

**Problem:** `addTagFilter` function repeated in Board, Outline, Search.

**Solution:**
```typescript
// src/hooks/useTagFilter.ts
export function useTagFilter(initial: string[] = []) {
  const [tags, setTags] = useState(initial)

  const addTag = (raw: string) => {
    const tag = normalizeTag(raw)
    if (tag && !tags.includes(tag)) {
      setTags(prev => [...prev, tag])
    }
  }

  const removeTag = (tag: string) => {
    setTags(prev => prev.filter(t => t !== tag))
  }

  const clearTags = () => setTags([])

  return { tags, addTag, removeTag, clearTags, setTags }
}
```

---

### 3.2 Split Large Components

#### 3.2.1 Capture.tsx (836 lines → ~400 lines)

**Extract:**

| New File | Lines | Purpose |
|----------|-------|---------|
| `components/RecentCaptures.tsx` | ~80 | Recent items list with actions |
| `components/CapturePreview.tsx` | ~60 | Parsed input preview display |
| `components/CaptureTemplates.tsx` | ~30 | Template buttons |
| `components/InstallPrompt.tsx` | ~50 | PWA install hint |
| `hooks/usePrefillInput.ts` | ~70 | URL prefill parsing logic |
| `hooks/useLinkDetection.ts` | ~30 | URL extraction from text |

**Remaining in Capture.tsx:** Core form state and save logic (~400 lines)

---

#### 3.2.2 CommandPalette.tsx (653 lines → ~300 lines)

**Extract:**

| New File | Lines | Purpose |
|----------|-------|---------|
| `components/QuickAddSection.tsx` | ~100 | Quick add preview and validation |
| `components/PaletteResults.tsx` | ~80 | Search results rendering |
| `hooks/useQuickAdd.ts` | ~100 | Quick add parsing and creation |
| `hooks/usePaletteNavigation.ts` | ~50 | Keyboard navigation logic |

---

#### 3.2.3 Outline.tsx (733 lines → ~350 lines)

**Extract:**

| New File | Lines | Purpose |
|----------|-------|---------|
| `components/OutlineFilters.tsx` | ~100 | Filter panel |
| `components/SavedViewsCard.tsx` | ~50 | Saved views section |
| `components/BulkActionsBar.tsx` | ~60 | Bulk operations |
| `hooks/useFilterSync.ts` | ~80 | URL param synchronization |
| `hooks/useBulkOperations.ts` | ~60 | Bulk tag/status updates |

---

### 3.3 CSS Consolidation

#### 3.3.1 Add Accent Color Variables (Save ~30 declarations)

```css
:root {
  /* Existing variables... */

  /* Accent opacity variants */
  --accent-8: rgba(37, 99, 235, 0.08);
  --accent-12: rgba(37, 99, 235, 0.12);
  --accent-18: rgba(37, 99, 235, 0.18);
  --accent-25: rgba(37, 99, 235, 0.25);
  --accent-40: rgba(37, 99, 235, 0.4);
  --accent-60: rgba(37, 99, 235, 0.6);
  --accent-80: rgba(37, 99, 235, 0.8);
}
```

Replace 12+ hardcoded `rgba(37, 99, 235, ...)` values.

---

#### 3.3.2 Consolidate Alert Box Styles

**Before (duplicated):**
```css
.captureErrors { /* ... */ }
.captureWarnings { /* ... */ }
.paletteQuickAddErrors { /* ... */ }
.paletteQuickAddWarnings { /* ... */ }
```

**After:**
```css
.alert-box {
  font-size: 12px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--border);
}
.alert-box--error {
  border-color: rgba(248, 113, 113, 0.4);
  background: rgba(248, 113, 113, 0.16);
}
.alert-box--warning {
  border-color: rgba(245, 158, 11, 0.4);
  background: rgba(245, 158, 11, 0.16);
}
```

---

### 3.4 Remove Unused Code

**Verify and potentially remove:**
- Check if `.preview` class (CSS lines 531-541) is used
- Check if `.nav__key` styles are needed (hidden on mobile)
- Remove any commented-out code blocks

---

## 4. Efficiency Improvements

### 4.1 Route-Level Code Splitting

**Current:** All pages bundled together.

**Improvement:**
```typescript
// App.tsx
import { lazy, Suspense } from 'react'

const Capture = lazy(() => import('./pages/Capture'))
const Outline = lazy(() => import('./pages/Outline'))
const Board = lazy(() => import('./pages/Board'))
const Search = lazy(() => import('./pages/Search'))
const Review = lazy(() => import('./pages/Review'))
const Import = lazy(() => import('./pages/Import'))
const NodeDetail = lazy(() => import('./pages/NodeDetail'))

// In routes:
<Route path="/capture" element={
  <Suspense fallback={<LoadingSpinner />}>
    <Capture />
  </Suspense>
} />
```

**Benefit:** Initial bundle reduced by ~40%, faster first paint.

---

### 4.2 Debounce Search Inputs

**Current:** Some searches fire on every keystroke.

**Improvement:** Consistent 200-300ms debounce on all search inputs.

```typescript
// src/hooks/useDebounce.ts
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
```

---

### 4.3 Memoize Expensive Renders

**Problem:** Large lists re-render on any state change.

**Solution:**
```typescript
// Memoize row components
const NodeRow = memo(({ node, onSelect, ...props }) => {
  // ...
})

// Memoize callbacks
const handleSelect = useCallback((id: string) => {
  setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
}, [])
```

---

### 4.4 Optimize Tag Normalization

**Current:** Tags normalized on every render in `.map()`.

**Improvement:** Normalize once during data fetch, not in render.

```typescript
// In useListNodes hook
const normalizeNodeRows = (rows: unknown[]): NodeRow[] =>
  (rows ?? []).map(row => ({
    ...(row as NodeRow),
    tags: Array.isArray((row as NodeRow).tags)
      ? (row as NodeRow).tags.map(normalizeTag)
      : [],
  }))
```

---

### 4.5 Reduce useEffect Dependencies

**Problem:** Some effects have unstable dependencies causing unnecessary re-runs.

**Example in Capture.tsx:**
```typescript
// Before - effect runs on every filters change
useEffect(() => {
  loadRecent()
}, [filters])

// After - effect runs only when needed
const loadRecent = useCallback(async () => { ... }, [])
useEffect(() => {
  loadRecent()
}, [loadRecent])
```

---

### 4.6 Virtual Scrolling for Long Lists

**For future consideration:** If lists exceed ~100 items, implement virtual scrolling using `react-window` or native intersection observer.

**Current state:** Not urgent - lists limited to 50-200 items.

---

## 5. Implementation Priorities

### Phase 1: Quick Wins (1-2 days)

| Task | Impact | Effort |
|------|--------|--------|
| Create `src/utils/tagUtils.ts` | -80 lines | 30 min |
| Export validation helpers from quickAddParse | -60 lines | 20 min |
| Add CSS accent color variables | Maintainability | 1 hr |
| Replace `alert()` with state-based messages | UX | 1 hr |
| Add route-level code splitting | Performance | 2 hrs |

**Estimated code reduction: ~140 lines**

---

### Phase 2: Hook Extraction (2-3 days)

| Task | Impact | Effort |
|------|--------|--------|
| Create `useListNodes` hook | -150 lines, consistency | 3 hrs |
| Create `useTagFilter` hook | -40 lines | 1 hr |
| Create `useDebounce` hook | Performance | 30 min |
| Create `useFilterSync` hook | -80 lines from Outline | 2 hrs |

**Estimated code reduction: ~270 lines**

---

### Phase 3: Component Extraction (3-4 days)

| Task | Impact | Effort |
|------|--------|--------|
| Split Capture.tsx | Maintainability | 4 hrs |
| Split CommandPalette.tsx | Maintainability | 3 hrs |
| Split Outline.tsx | Maintainability | 3 hrs |
| Create shared LoadingSpinner | Consistency | 1 hr |
| Create shared EmptyState | UX | 1 hr |

**Estimated code reduction: ~200 lines (net, after extraction)**

---

### Phase 4: Polish & Features (1 week)

| Task | Impact | Effort |
|------|--------|--------|
| Dark/Light theme toggle | UX | 2 hrs |
| Keyboard shortcuts modal | Discoverability | 2 hrs |
| Undo for quick actions | UX | 4 hrs |
| Better empty states | UX | 2 hrs |
| Bulk export | Feature | 3 hrs |

---

## Summary

### Expected Outcomes

| Metric | Current | After Refactor |
|--------|---------|----------------|
| Total TS lines | ~5,350 | ~4,300 (-20%) |
| Largest component | 836 lines | ~400 lines |
| Duplicate functions | 8+ instances | 0 |
| Custom hooks | 0 | 6-8 |
| Initial bundle | ~180KB | ~110KB (estimated) |
| Code splitting | None | Per-route |

### Key Principles

1. **Don't add complexity** - Each refactor should simplify, not complicate
2. **Preserve functionality** - All existing features must continue working
3. **Incremental changes** - Small, testable commits over big rewrites
4. **Mobile-first maintained** - Don't regress mobile experience

---

## Appendix: File-by-File Summary

| File | Lines | Issues | Priority |
|------|-------|--------|----------|
| Capture.tsx | 836 | Too large, duplicate code | High |
| Outline.tsx | 733 | Too large, filter complexity | High |
| CommandPalette.tsx | 653 | Too large, duplicate validation | High |
| Board.tsx | 342 | alert() usage, duplicate normalizeTag | Medium |
| Search.tsx | 329 | alert() usage, duplicate normalizeTag | Medium |
| Home.tsx | 297 | duplicate normalizeTag | Low |
| Review.tsx | 251 | duplicate normalizeTag | Low |
| NodeDetail.tsx | 247 | duplicate normalizeTag, no unsaved warning | Medium |
| index.css | 640 | Hardcoded colors, duplicate patterns | Medium |
