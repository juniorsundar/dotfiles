# 16 — Characterize the recent bug-fix behaviors at the host seam

**What to build:** Before any session behavior moves, lock the two recent bug fixes behind explicit host-seam characterization tests so the refactor cannot silently change them. The two behaviors are preview bloat (stale or oversized preview output after rapid selection changes) and focus timing (the panel input gaining or not gaining focus across start, ready, cancel, and teardown-triggered re-arm). These tests run at the existing PickerHost seam — a faked VS Code module plus a fake webview — and assert only externally observable behavior: posted messages, capability calls, focus commands, and session lifecycle outcomes. They do not assert private host state. When this ticket lands, the host is unchanged but the two race-prone behaviors are pinned; subsequent tickets can move their ownership into PickerSession and these tests guard the move. The spec's other behavioral coverage (file picker flow, grep streaming, chooser handoff, ready/reload reconstruction) is already present and is not duplicated here — only the two uncharacterized fixes are added.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] A host-seam test characterizes the preview-bloat fix: rapid selection changes followed by a settle do not post stale or oversized preview output, and a superseded selection's preview is not delivered.
- [ ] A host-seam test characterizes the focus-timing fix: the panel input receives focus on a visibility/refocus start and on initial resolve, and does not receive focus after a cancel-triggered teardown re-arm while the panel stays visible.
- [ ] Both tests assert only externally observable behavior (posted messages, capability calls, focus commands, lifecycle outcomes) and do not inspect private host fields.
- [ ] The existing test suite, type checking, and build pass.