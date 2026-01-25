# AGENTS.md

Purpose: quick orientation for AI agents (Codex/LLMs) working in this repo.

## Project overview
- Vite + React + TypeScript PWA with Supabase Auth.
- Core domain: capture/search of nodes (ideas/tasks), taggable, with FTS search.

## Current goals (Jan 2026)
- Full-text search via Supabase RPC (`search_nodes`) with owner-scoped filters.
- Tag chips/autocomplete in Capture and tag filtering in Search.
- Keep UI phone-first and minimal; no new dependencies.

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

## Supabase / SQL
- Migration file: `supabase/migrations/20260125_fts_search_nodes.sql`.
  - Adds/uses `nodes.search` tsvector.
  - Creates trigger if column is not generated; skips trigger if generated.
  - Adds GIN index on `nodes.search`.
  - Creates RPC `public.search_nodes(q, lim, type_filter, status_filter, tag_filter)`.
  - RPC returns `tags text[]` per node (preferred vs extra query).

## How to apply SQL (Dashboard)
1. Supabase Dashboard → SQL Editor → New query.
2. Paste migration contents from `supabase/migrations/20260125_fts_search_nodes.sql`.
3. Run.

## Conventions
- Keep TypeScript strict; avoid `any` unless unavoidable.
- Keep UI inline styles minimal; avoid dependencies.
- Use lowercase tags.

## Known constraints
- `src/pages/Capture.tsx` may be root-owned on some setups; edit with elevated permissions if needed.

## Suggested smoke test
- Create a node with tags in Capture.
- Search with text + tag filters; click tag chips to AND-filter.
- `npm run build` should pass.
