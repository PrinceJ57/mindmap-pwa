# Mindmap PWA Reference

A quick in-repo wiki for features, routes, and shortcuts.

## Core concepts
- Nodes: Ideas or Tasks.
- Statuses: `inbox`, `active`, `waiting`, `someday`, `done`, `archived`.
- Tags: Lowercase strings (chips). Stored in `tags` + `node_tags`.
- Context: Optional single token (e.g. `@home`).

## Routes
- `/home` Dashboard with key panels + saved views.
- `/capture` Capture form with tags + offline queue support.
- `/search` Full-text search + filters.
- `/board` Kanban drag/drop by status.
- `/outline` Table view with multi-select + bulk actions.
- `/review` Due buckets + quick actions.
- `/import` Bulk import (.md/.txt/.csv).
- `/node/:id` Node detail page with links/backlinks.
- `/login` Auth.

## Command Palette
- Open: `Cmd+K` (mac) / `Ctrl+K` (win/linux) or the small `⌘K` button in nav (desktop only).
- Close: `Esc`, click overlay, or choose an item.
- Keys: Up/Down to move, Enter to run.
- Static commands:
  - New Idea, New Task
  - Go: Home, Board, Outline, Review, Import, Search
- Node search: type to search titles/bodies and open nodes.

## Quick Add (smart line)
Quick Add lives inside the Command Palette.

How to trigger Quick Add:
- Start with `>` (recommended), or
- Start with `add `, or
- Include tokens like `#tag`, `@context`, `!status`, `type:`, `due:`

Syntax tokens:
- `#tag` -> tag (lowercased)
- `@context` -> context (first one wins)
- `!status` -> status (`inbox|active|waiting|someday|done|archived`)
- `type:idea` or `type:task`
- `due:YYYY-MM-DD`

Everything else becomes the **title**.
Defaults:
- `type`: idea
- `status`: inbox
- `body`: empty

Example:
```
> Fix bathroom fan #renovation #electrical @home !active type:task due:2026-02-01
```

On success: shows “Created” and keeps you in place.
On offline/network error: queues for sync and shows “Saved offline; will sync.”

## Capture
- Tag input: chips + autocomplete from `tags` table. Enter/comma adds tags; backspace removes last.
- Uses shared node write helper with tags + node_tags upsert.
- Offline: failures due to network queue in localStorage and auto-sync later.

### Capture URL prefill
Open `/capture` with query params:
- `title`, `body` or `text`, `tags`, `context`, `type`, `status`
- If `body` or `text` present, adds default tag `dictated`.

Example:
```
/capture?body=hello&title=test&tags=a,b&context=phone&type=idea&status=inbox
```

## Search
- Uses `search_nodes` RPC with text + filters.
- Tag chips add AND filters.
- Clear all filters button resets filters.

## Board
- Kanban drag/drop between statuses.
- Uses `list_nodes` RPC; drag/drop updates via `set_node_status`.

## Outline
- Table view with multi-select.
- Bulk actions: status changes + tag adds.
- Uses `list_nodes` RPC.

### Outline filter query params
- `q`, `type`, `statuses` (comma-separated), `tags` (comma-separated), `pinnedOnly`, `sort`
- Example:
```
/outline?q=renovation&type=task&statuses=active,waiting&tags=home,urgent&pinnedOnly=1&sort=updated
```

## Review
- Buckets due items.
- Quick actions: snooze/promote/archive/pin.

## Home dashboard
- Inbox/Active/Pinned/Recent panels.
- Saved views list with deep links to Outline filters.

## Import
- Import `.md`, `.txt`, or `.csv`.
- Shows preview, progress, and per-item errors.

## Node Detail
- Editable title/body/type/status/tags + Save + Archive.
- Links & backlinks; add/remove relationships.
- Relations: `related`, `supports`, `blocks`, `depends_on`.

## Offline queue
- Failed saves (network/transient) are queued in localStorage.
- Header shows queued count + “Sync now” button.
- Auto-sync attempts periodically when signed in.

## Status reference
```
Statuses: inbox | active | waiting | someday | done | archived
Types: idea | task
```
