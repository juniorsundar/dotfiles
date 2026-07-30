# 11 — Extend showPreview with an optional reveal position

**What to build:** The host's `showPreview` picker-context method gains an optional `reveal: { line: number; character: number }`. After showing the session-owned virtual preview document, the host reveals that position (`revealRange`) so the virtual preview scrolls to the line rather than opening at the top. This is the host capability the grep picker's preview (and the future document-symbols picker) depends on; building it first makes the grep preview a pure composition over an existing host capability. Verified at the existing host seam with a fake picker whose preview passes a reveal position, asserting the host reveals the editor at the right line.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] The `showPreview` picker-context method accepts an optional reveal position (`{ line, character }`) in addition to `{ text, title, languageId? }`.
- [x] When a reveal position is supplied, the host reveals the virtual preview document at that position so the match line is scrolled into view; when omitted, behavior is unchanged from today (open at top).
- [x] A picker that does not pass a reveal position (e.g. the existing file picker) continues to preview exactly as before — no regression.
- [x] The reveal is race-safe and teardown-safe: a stale reveal from a replaced or cancelled session cannot scroll a torn-down or superseded virtual document (ticket 09's guarantees hold).
- [x] Host-level behavioural tests cover: reveal scrolls to the supplied line, no-reveal is unchanged, and a stale reveal from a replaced/cancelled session does not act.