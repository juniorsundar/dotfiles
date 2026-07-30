# 04 — Build the host and wire the file picker through the shared view

**What to build:** A picker-agnostic host replaces the monolithic provider. The host owns the single shared webview view with host-owned static HTML generated once at resolve; the generalized message protocol that carries labels, empty-state text, row parts, and candidates by postMessage; session state; the lifecycle (exit, restoring the origin editor and selection on cancel, restoring panel visibility, clearing the preview timer, returning focus); preview debounce that calls the active picker's preview action; and picker invocation that reconfigures the shared view's content via messages rather than rewriting the webview HTML or declaring a new view. The registry is wired at activation, and the Find File command invokes the file picker by id. The old monolithic provider is deleted. The file picker now runs end-to-end through the new five-axis architecture, with behavior preserved.

**Blocked by:** 03 — Assemble the file picker from parts; introduce Picker core types and registry.

**Status:** completed

- [x] A picker-agnostic host owns the single shared webview view; its HTML is host-owned, static, and generated once at resolve.
- [x] Picker invocation reconfigures the shared view's content (labels, empty-state text, row parts, candidates) via postMessage, not by rewriting the webview HTML or declaring a new view.
- [x] The host owns lifecycle: on cancel it restores the origin editor and selection; on exit it restores prior panel visibility; it clears the preview timer and returns focus. Lifecycle is identical regardless of which picker is active.
- [x] The host owns preview debounce and calls the active picker's preview action through PickerContext; rapid keyboard navigation does not open every traversed candidate.
- [x] The host routes accept to the active picker's Accept through PickerContext, then runs the exit lifecycle.
- [x] The registry is wired at activation; the Find File command invokes the file picker by id and focuses the shared view.
- [x] The old monolithic provider is deleted; no file-picker-specific logic remains in the host.
- [x] Running the extension: Find File works exactly as before — same narrowing, filename + directory rows, debounced preview, Enter to accept and focus the editor, Escape to restore the origin, panel visibility restored on exit. No user-visible regression.