# iOS Shortcut: Share to Capture

Use this to send any shared text/URL into the capture box.

## Shortcut steps
1) Create a new Shortcut.
2) Add “Get Text from Input”.
3) Add “Open URLs”.
4) Set the URL to:
```
https://YOUR_APP_DOMAIN/capture?text=shortcut-input&source=ios_share&autosave=1
```
5) Enable “Show in Share Sheet”.
6) The `autosave=1` parameter will save immediately when a title can be derived from the shared text. If you remove `autosave=1`, you will need to tap Save manually after reviewing or editing.

## Notes
- The capture page will prefill the input with the shared text.
- If the text contains a URL, the page will offer link-tag suggestions.
- Shared items are tagged `#shared_ios`.
- If a bare domain like `rtl-sdr.com` is shared, the app will treat it as a URL.
