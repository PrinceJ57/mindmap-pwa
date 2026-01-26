# AGENTS.md

Purpose: quick orientation for AI agents (Codex/LLMs) working in this repo.

## Project overview
- Vite + React + TypeScript PWA with Supabase Auth.
- Core domain: capture/search of nodes (ideas/tasks), taggable, with FTS search.

## Current goals (Jan 2026)
- Kanban board at `/board` with native HTML5 drag/drop between status columns.
- Outline/table view at `/outline` with multi-select + bulk actions (status + tags).
- Shared `list_nodes` RPC for owner-scoped listing with FTS + tag AND filters.
- Node detail view with editable fields, tag editing, and links/backlinks.
- Review Mode at `/review` for due items + quick actions (snooze/promote/archive/pin).
- Home dashboard at `/home` with key panels + saved views list.
- Saved views (smart lists) with CRUD + deep-link to Outline filters.
- Keep UI phone-first and minimal; no new dependencies.

## Goals achieved in this commit
- Added `/home` dashboard with Inbox/Active/Pinned/Recent panels + saved views list.
- Added `/review` mode with bucketed due items and quick actions (snooze/promote/archive/pin).
- Added saved views CRUD and Outline deep-link filter support via query params.
- Added `/import` page for bulk import of .md/.txt/.csv with preview + progress + per-item errors.
- Added shared node write helper (`src/lib/nodeWrites.ts`) and tag parsing helper (`src/lib/tagParse.ts`).
- Extended `list_nodes` to support pinned/review filters and return updated fields.
- Added helper RPCs `set_node_pinned` + `set_node_review_after`.
- Added nodes metadata: `updated_at`, `pinned`, `review_after` + update trigger.
- Added `saved_views` table with RLS + updated_at trigger.
- Wired Home/Review routes + nav links; shared status constants + filter helpers.
- Added offline capture queue with localStorage persistence and auto-sync retry.
- Capture now queues failed saves (network/transient errors) and shows offline status.
- Header shows queued count with a “Sync now” button for manual sync.
- Capture supports Shortcut-style URL prefill (title/body/tags/context/type/status) with a prefill banner and auto-removal of query params.

## New goals created
- (Optional) Add a `/queue` page to inspect queued items and retry/remove individually.

## Key implementation notes
- Tag input UI lives in `src/components/TagInput.tsx`.
  - Chips + autocomplete from `tags` table.
  - Enter/comma adds tags; backspace removes last tag.
- Capture uses TagInput and saves tags via `tags` + `node_tags` upserts.
  - File: `src/pages/Capture.tsx`.
- Capture can prefill fields from query params and adds the default tag `dictated` when body/text is provided.
  - Helper: `src/lib/queryPrefill.ts`.
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
- Shared status constants: `src/utils/status.ts`.
- Filter <-> query param helpers for saved views + Outline deep links:
  - File: `src/utils/viewFilters.ts`.
- Home dashboard panels + saved views list:
  - File: `src/pages/Home.tsx`.
- Review mode buckets + quick actions:
  - File: `src/pages/Review.tsx`.
- Import page for bulk .md/.txt/.csv import with preview, tags, progress, and per-item errors:
  - File: `src/pages/Import.tsx`.
- Shared node write helper for create + tag upserts + node_tags linking:
  - File: `src/lib/nodeWrites.ts`.
- Tag parsing helpers for inline tags and normalization:
  - File: `src/lib/tagParse.ts`.
- Node detail page: `src/pages/NodeDetail.tsx`.
  - Editable title/body/type/status/tags + Save + Archive.
  - Links section with outgoing/incoming backlinks + modal for linking.
  - Uses RPCs `get_node_detail`, `get_node_links`, `create_edge`, `delete_edge`.

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
- Migration file: `supabase/migrations/20260125_edges_links.sql`.
  - Creates `edges` table with uniqueness + no-self-link constraints.
  - Adds RLS policies for owner-scoped select/insert/delete.
  - Adds RPCs: `get_node_detail`, `get_node_links`, `create_edge`, `delete_edge`.
- Migration file: `supabase/migrations/20260125_saved_views_review.sql`.
  - Adds `updated_at`, `pinned`, `review_after` to `nodes` + updated_at trigger.
  - Adds `saved_views` table with unique(owner_id, name) + RLS + updated_at trigger.
  - Extends `public.list_nodes` with `pinned_only`, `review_due_only` + returns updated fields.
  - Adds RPCs: `set_node_pinned`, `set_node_review_after`.

## How to apply SQL (Dashboard)
1. Supabase Dashboard → SQL Editor → New query.
2. Paste migration contents from `supabase/migrations/20260125_fts_search_nodes.sql`.
3. Run.
4. Paste migration contents from `supabase/migrations/20260125_list_nodes.sql`.
5. Run.
6. Paste migration contents from `supabase/migrations/20260125_edges_links.sql`.
7. Run.
8. Paste migration contents from `supabase/migrations/20260125_saved_views_review.sql`.
9. Run.

## Conventions
- Keep TypeScript strict; avoid `any` unless unavoidable.
- Keep UI inline styles minimal; avoid dependencies.
- Use lowercase tags.

## Known constraints
- `src/pages/Capture.tsx` may be root-owned on some setups; edit with elevated permissions if needed.

## Suggested smoke test
- Create a node with tags in Capture.
- Open `/capture?body=hello&title=test&tags=a,b&context=phone&type=idea&status=inbox` and confirm prefill + banner + query removal.
- Search with text + tag filters; click tag chips to AND-filter.
- Drag a node across statuses in Board; verify status persists after refresh.
- Select multiple rows in Outline; bulk set status + bulk add tags.
- Open any node from Search/Board/Outline and edit fields/tags.
- Add a link from Node Detail; verify backlink shows on target.
- Import a small .md/.txt/.csv set and verify tags/status are correct.
- `npm run build` should pass.

## Command Palette update (2026-01-26)
- Summary: Added a Command Palette (Cmd/Ctrl+K) with static navigation/actions, node search via RPC, and recent node recall. Integrated a small nav trigger button and added palette styling.
- Files touched: `src/components/CommandPalette.tsx`, `src/lib/recentNodes.ts`, `src/pages/NodeDetail.tsx`, `src/App.tsx`, `src/index.css`, `AGENTS.md`.
- Goals:
  - Command Palette implemented.
  - Keyboard navigation works.
  - Node search integrated.
  - No breaking changes.
- Verification commands (expected results):
  - `npm install` (dependencies install cleanly).
  - `npm run dev` (dev server starts, app loads).
  - `npm run build` (production build succeeds).
- Manual test checklist:
  - Press Cmd/Ctrl+K on desktop to open the palette; Esc closes it.
  - Click the Cmd+K nav button to open; click overlay to close.
  - Arrow Up/Down changes selection; Enter runs the highlighted item.
  - Search for a node title/body and open it; ensure it navigates to `/node/:id`.
  - Open a few nodes and re-open the palette with empty query to see Recent nodes.

## Quick Add update (2026-01-26)
- Summary: Added Quick Add smart-line parsing and Command Palette integration for fast node creation with tags, context, status, type, and due date. Uses existing node write helper and offline queue behavior.
- Files touched: `src/components/CommandPalette.tsx`, `src/lib/quickAddParse.ts`, `src/index.css`, `AGENTS.md`.
- Goals:
  - Quick Add parser implemented.
  - Supports #tags, @context, !status, type:, due:.
  - Reuses node creation helper and offline queue.
  - No breaking changes.
- Verification commands (expected results):
  - `npm run dev` (dev server starts, app loads).
  - `npm run build` (production build succeeds).
- Manual test checklist:
  - Open Command Palette and type `> Fix bathroom fan #renovation @home !active type:task due:2026-02-01` then press Enter; see “Created”.
  - Simulate offline (disable network) and create a Quick Add; see “Saved offline; will sync.” and queued count updates.
  - Open palette with empty query to ensure commands + recents still render.
  - Ensure existing capture, search, board, outline, review, import, and node detail flows still work.
