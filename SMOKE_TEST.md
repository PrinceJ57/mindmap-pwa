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
- Tap a capture template (Task/Idea/Waiting) and verify tokens appear in the input.
- Visit `/capture?text=https://youtube.com/watch?v=123` and confirm the input prefills.
- Confirm “link detected” appears and “Add #link #youtube” suggestion works.
- Visit `/capture?text=rtl-sdr.com&source=ios_share` and confirm it normalizes to `https://rtl-sdr.com`.
- Visit `/capture?text=https://example.com&source=ios_share&autosave=1` and confirm it auto-saves once.

## iOS safe-area
- In standalone mode, verify nav buttons and Capture header are fully visible and not under the notch.

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
