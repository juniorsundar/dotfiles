# 13 — Live-grep picker registered and commandable

**What to build:** The grep picker assembled from its parts and wired into the extension as a query-driven stream picker, invoked by a new `vsconsult.liveGrep` command. The source calls the injected `searchWorkspace` primitive and returns streamed `GrepCandidate` batches; narrowing is an identity / light post-filter against the matched line text (the shared fuzzy primitive, no path bias); render projects a trimmed-line primary, a `path:line` secondary, and an absolute-path tooltip; accept opens the matched file for real and reveals the cursor at the match line and column (0-based); preview reads bounded content via the existing content policy and reveals at the match line using the host capability from ticket 11. Registered at activation alongside the file picker and served by the same shared webview view; the only `package.json` edit is the new command entry. Demoable end-to-end: run the command, type a query, see matches stream in, arrow through them with a live preview scrolled to the match, Enter jumps to the match, Escape restores the origin.

**Blocked by:** 11 — Extend showPreview with an optional reveal position; 12 — Ripgrep spawn wrapper producing GrepCandidate streams.

**Status:** ready-for-agent

- [ ] A `vsconsult.liveGrep` command is declared in `package.json` (commands and activationEvents) and invokes `host.start("grep")`; no new view, view-container, or view declaration — the existing shared webview view serves it.
- [ ] The grep picker is registered with the host registry at activation, with id `"grep"`, label "Grep", placeholder "Search workspace contents…", and empty state "No matches".
- [ ] The source is a query-driven stream that calls the injected `searchWorkspace` and yields streamed `GrepCandidate` batches; the host's query-driven re-sourcing cancels the in-flight run on query change (ticket 05 support).
- [ ] Narrowing is an identity / light post-filter over the streamed candidates, matching the query against `label` (the matched line text) via the shared fuzzy primitive, with no path bias in the primitive.
- [ ] Render returns `RowParts` with primary = trimmed matched line text, secondary = `${relativePath}:${lineNumber}`, tooltip = `absolutePath`; the host maps these into its existing DOM slots.
- [ ] Accept opens the matched file for real via `openTextDocument(absolutePath, { preview: false })` then reveals the cursor at the match via `revealPosition(absolutePath, { line: lineNumber - 1, character: column - 1 })`; the same absolute path is passed to both.
- [ ] Preview reads bounded content via `readPreviewContent` (large/binary files fall back per ADR-0004) and reveals at the match line via the `showPreview` reveal capability from ticket 11.
- [ ] Empty query shows the picker's empty state and spawns nothing (the source returns an empty snapshot).
- [ ] Ctrl+P history containment holds (ticket 07): previewing grep matches never creates real-file entries in the Quick Open history; previews stay race-safe and teardown-safe (ticket 09).
- [ ] Picker-part tests cover source (injected fake `searchWorkspace`), narrow, render, accept, and preview (fake `PickerContext`), mirroring `src/filePicker/*.test.ts`.
- [ ] End-to-end: running `vsconsult.liveGrep`, typing a query, streaming matches, previewing at the match, and accepting jumps to the match with the cursor on its column; Escape restores the origin.