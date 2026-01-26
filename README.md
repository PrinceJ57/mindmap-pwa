# Mindmap PWA

Mindmap PWA is a phone-first personal knowledge + task system built around fast capture, tags, and flexible views. It blends quick idea capture with task management and cross-linking, backed by Supabase Auth and Postgres full-text search.

Use it to:
- Capture ideas/tasks quickly (online or offline).
- Tag and search everything with FTS + AND filters.
- Drag tasks across a Kanban board or batch-edit in a table view.
- Review due items with a dedicated Review mode.
- Link ideas and tasks with backlinks.
- Maintain saved views and jump to filtered outlines.

## Key features
- **Command Palette (Cmd/Ctrl+K):** global navigation + quick node search.
- **Quick Add smart line:** create nodes from a single line with tokens (`#tag`, `@context`, `!status`, `type:`, `due:`).
- **Capture:** rich capture form with tag chips + prefill via URL.
- **Search:** full-text search + tag AND filters.
- **Board:** Kanban with native HTML5 drag/drop.
- **Outline:** table view with multi-select + bulk status/tag actions.
- **Review:** due buckets with quick actions.
- **Node Detail:** editable fields + links/backlinks.
- **Import:** bulk import from `.md`, `.txt`, `.csv`.
- **Offline queue:** failed saves are queued and auto-synced.

## Reference wiki
For shortcuts, syntax, and feature details, see:
- `docs/WIKI.md`

## Stack
- Vite + React + TypeScript
- Supabase Auth + Postgres (FTS + RPCs)

## Scripts
```
npm run dev
npm run build
```

## Project structure (high level)
- `src/pages/*` routes (Capture, Search, Board, Outline, Review, Home, Import, NodeDetail)
- `src/components/*` shared UI (TagInput, TagChips, CommandPalette)
- `src/lib/*` helpers (node writes, query prefill, quick add parser)
- `supabase/migrations/*` database schema + RPCs

## Notes
- Tags are normalized to lowercase.
- Statuses: `inbox`, `active`, `waiting`, `someday`, `done`, `archived`.
- Types: `idea`, `task`.
