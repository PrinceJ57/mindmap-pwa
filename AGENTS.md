# AGENTS.md

Purpose: quick orientation for AI agents (Codex/LLMs) working in this repo.

## Project overview
- Vite + React + TypeScript PWA with Supabase Auth.
- Core domain: capture/search of nodes (ideas/tasks), taggable, with FTS search.

## Current goals (Jan 2026)
- Kanban board at `/board` with native HTML5 drag/drop between status columns.
- Outline/table view at `/outline` with multi-select + bulk actions (status + tags).
- Shared `list_nodes` RPC for owner-scoped listing with FTS + tag AND filters.
- Keep UI phone-first and minimal; no new dependencies.

## Goals achieved in this commit
- Added `/board` Kanban with drag/drop, optimistic status updates, and tag chips.
- Added `/outline` table with multi-select, bulk status update, and bulk tag add.
- Added `list_nodes` + `set_node_status` RPCs (owner-scoped) in SQL migration.
- Added shared `TagChips` component; wired new routes in App header/nav.

## Key implementation notes
- Tag input UI lives in `src/components/TagInput.tsx`.
  - Chips + autocomplete from `tags` table.
  - Enter/comma adds tags; backspace removes last tag.
- Capture uses TagInput and saves tags via `tags` + `node_tags` upserts.
  - File: `src/pages/Capture.tsx`.
- Search uses RPC `search_nodes` with type/status/tag filters and tag chips.
  - File: `src/pages/Search.tsx`.
  - Clicking a tag chip adds it to tag filters (AND semantics).
  - Includes "Clear all filters" button.
- Board uses RPC `list_nodes` to fetch nodes + tags; drag/drop updates via `set_node_status`.
  - File: `src/pages/Board.tsx`.
- Outline uses RPC `list_nodes` for table display; bulk status uses `set_node_status`.
  - Bulk tag add reuses `tags` + `node_tags` upserts across selected nodes.
  - File: `src/pages/Outline.tsx`.
- Shared tag chip renderer: `src/components/TagChips.tsx`.

## Supabase / SQL
- Migration file: `supabase/migrations/20260125_fts_search_nodes.sql`.
  - Adds/uses `nodes.search` tsvector.
  - Creates trigger if column is not generated; skips trigger if generated.
  - Adds GIN index on `nodes.search`.
  - Creates RPC `public.search_nodes(q, lim, type_filter, status_filter, tag_filter)`.
  - RPC returns `tags text[]` per node (preferred vs extra query).
- Migration file: `supabase/migrations/20260125_list_nodes.sql`.
  - Creates RPC `public.list_nodes(lim, q, type_filter, status_filter, tag_filter)` returning tags.
  - Uses FTS (plainto_tsquery) or ILIKE fallback if `nodes.search` is null.
  - Enforces owner scope and AND tag filtering.
  - Adds RPC `public.set_node_status(node_id, new_status)` (owner-scoped).

## How to apply SQL (Dashboard)
1. Supabase Dashboard → SQL Editor → New query.
2. Paste migration contents from `supabase/migrations/20260125_fts_search_nodes.sql`.
3. Run.
4. Paste migration contents from `supabase/migrations/20260125_list_nodes.sql`.
5. Run.

## Conventions
- Keep TypeScript strict; avoid `any` unless unavoidable.
- Keep UI inline styles minimal; avoid dependencies.
- Use lowercase tags.

## Known constraints
- `src/pages/Capture.tsx` may be root-owned on some setups; edit with elevated permissions if needed.

## Suggested smoke test
- Create a node with tags in Capture.
- Search with text + tag filters; click tag chips to AND-filter.
- Drag a node across statuses in Board; verify status persists after refresh.
- Select multiple rows in Outline; bulk set status + bulk add tags.
- `npm run build` should pass.
