# Smoke Test Checklist (10 minutes)

Run this after any change before deploy.

## Build
- `npm run build` succeeds.

## Auth / Login
- Visit `/login`, sign in with Google.
- Verify redirect lands on `/capture`.

## Quick Add (Command Palette)
- Open with Cmd/Ctrl+K.
- Type: `> Fix bathroom fan #renovation @home !active type:task due:2026-02-01`
- Press Enter → “Created” message; node exists in Search.

## Mobile Capture (/capture)
- Open `/capture` and enter: `Buy batteries #errands !inbox`.
- Press Enter to save; confirm “Saved ✅”.
- Go offline and repeat; confirm “Queued offline; will sync.”

## Capture + Tags
- Create a node in `/capture` with tags.
- Confirm tags show up in TagInput suggestions later.

## Board
- Open `/board`, confirm columns load.
- Apply tag filter and clear it.
- Drag a card to a new status and refresh; status persists.

## Node Detail
- Open a node, edit title/body, save.
- Archive and confirm status is `archived`.

## Links
- From Node Detail, create a link to another node.
- Remove the link; backlinks update.

## Evil twin mini-check
- In a second browser profile (User B), try opening User A’s `/node/:id`.
- Expect “Node not found” and no access.

## Release ritual
1) `npm run build`
2) Run this smoke test
3) Deploy
