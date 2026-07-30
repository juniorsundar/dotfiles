# Live-grep picker

## Problem Statement

vsconsult ships a keyboard-first file picker (`vsconsult.findFile`) that gives a Consult-like narrowing interaction inside VSCodium's bottom Panel. It narrows the workspace by *file name*. When a user remembers a string, a function name, or an error message but not which file it lives in, Find File cannot help. They fall back to the built-in Search panel (Ctrl+Shift+F), which is a different, heavier interaction: a split view with a results tree, no transient narrowing list, and no Consult-style preview-and-accept.

The architecture already anticipates this. ADR-0003 declared sources query-aware and snapshot-or-stream, named live-grep as the motivating query-driven stream source, and shipped host support for streaming and query-driven re-sourcing (ticket 05) — but validated that support with a fake streaming source, because no real streaming picker existed yet. The grep picker is the first real query-driven stream source and the proof that the architecture holds against a live backend.

The user wants the same consult-style narrowing applied to *line content* instead of file names: type a query, see matches stream in as ripgrep finds them, arrow through them with a live preview scrolled to the match, and Enter to jump to the match.

## Solution

Add a live-grep picker as a new picker type configuring the existing five parts (Source / Candidate / Narrowing / Render / Accept+Preview). The query is both the ripgrep search pattern *and* the narrowing filter: as the user types, ripgrep runs and streams matched-line candidates; the candidate's label is the matched line text, so further typing post-filters the streamed lines. Arrow keys move through matches; the session-owned virtual preview shows the match's file scrolled to the match line; Enter opens the file for real at the match with the cursor on the match column; Escape cancels and restores the origin.

The picker is registered alongside the file picker and served by the same single shared webview view. No new webview HTML, no new view declaration, no `package.json` view or view-container entry — the existing shared view serves the grep picker via reconfiguration messages, exactly as it serves the file picker. Adding the picker is a code-only registration plus one command entry.

The ripgrep backend is a spawned `rg --json` process, with the binary path resolved through the `@vscode/ripgrep` package (the same package VS Code bundles). This decision and its alternatives are recorded in ADR-0005, which supersedes the last bullet of ADR-0003 (the bullet guessed live-grep "may reuse VS Code's search APIs"; it cannot, because VS Code exposes no public streaming *match* API).

## User Stories

### Searching

1. As a developer, I want to run a `vsconsult.liveGrep` command, so that I can start a content search in the consult-style picker without leaving the keyboard.
2. As a developer, I want to type a search string and see matching lines stream into the picker as ripgrep finds them, so that I do not wait for the whole workspace to finish scanning before seeing results.
3. As a developer, I want each candidate's primary text to be the matched line content, so that I can read what matched at a glance.
4. As a developer, I want each candidate's secondary text to show the file path and line number, so that I can tell which file and which line each match comes from.
5. As a developer, I want the candidate's tooltip to show its absolute path, so that I can disambiguate same-named files across folders.
6. As a developer, I want to keep typing after results have landed and have the visible set narrow to lines that still contain my typed string, so that one query both searches and filters.

### Navigating and previewing

7. As a developer, I want arrow keys (and Ctrl-N / Ctrl-P) to move through the streamed matches, so that keyboard navigation matches the file picker.
8. As a developer, I want a short, debounced live preview of the file at the match line when I pause on a candidate, so that I can read the surrounding context without committing.
9. As a developer, I want the preview to scroll to the match line (not just open the file at the top), so that I see the match in context immediately.
10. As a developer, I want Enter to open the matched file for real (not as a preview) and place the cursor at the match's line and column, so that I land exactly on the match, ready to edit.
11. As a developer, I want Escape to cancel the search and restore the editor and selection I came from, so that abandoning a search never loses my place.

### Streaming and lifecycle

12. As a developer, I want an empty query to show nothing rather than spawn ripgrep on `.*`, so that the picker does not flood with every line in the workspace before I start typing.
13. As a developer, I want the picker to respect the same file-exclude configuration the file picker uses, so that `node_modules`, `.git`, `dist`, and my configured excludes are not searched.
14. As a developer, I want changing the query to cancel the in-flight ripgrep run and start a fresh one with the new pattern, so that stale results never overwrite what I just typed.
15. As a developer, I want a streaming source that completes cleanly when ripgrep finishes, so that the picker stops showing a loading state once the workspace is fully scanned.
16. As a developer, I want match candidates that arrive after the query changes to be discarded, so that a slow previous run cannot inject stale lines into my fresh results.
17. As a developer, I want the grep picker to reuse the existing shared webview view, so that invoking it feels identical to Find File — same panel, same keybindings, same look.
18. As a developer, I want the grep picker to be registered in code at activation with no `package.json` view or view-container edit, so that adding it does not require a manifest change beyond a command entry.

### Backend and safety

19. As a developer, I want ripgrep located via the `@vscode/ripgrep` package, so that search behavior matches built-in search and the binary path is stable across platforms.
20. As a developer, I want the ripgrep spawn wrapper to debounce re-runs itself, so that rapid typing does not spawn a process per keystroke.
21. As a developer, I want the grep picker to leave Ctrl+P history containment intact, so that previewing grep matches never creates real-file entries that leak into the Quick Open history (ticket 07's guarantee holds).
22. As a developer, I want previews of large or binary files to fall back to the bounded-content policy, so that the grep preview never loads a multi-gigabyte file or emits corrupted bytes (ADR-0004 holds).
23. As a developer, I want the grep picker's preview to be race-safe and teardown-safe, so that a late preview read from a previous selection cannot overwrite the current one (ticket 09's guarantees hold).

## Implementation Decisions

### Catalog scope

- This picker is the second of four in the **navigation core**: file (done), **grep (this spec)**, document symbols (imenu), open buffers. The other two are out of scope for this spec and will be specced separately.

### Candidate shape — `GrepCandidate` extends the shared `Candidate` contract

- `id: string` — stable within a session, `${relativePath}:${lineNumber}:${column}`.
- `label: string` — the full matched line text (the line content as ripgrep reports it). This is the field Narrowing matches against, per the query-driven contract.
- `relativePath: string` — forward-slash-delimited path relative to the longest-matching workspace folder root, mirroring the file picker's relative-path convention.
- `absolutePath: string` — the absolute filesystem path of the matched file. Carried on the candidate so Accept and Preview pass the same path string to `openTextDocument` and `revealPosition`, avoiding a resolution step at accept time and the multi-root ambiguity of resolving a relative path against several folders.
- `lineNumber: number` — 1-based, the line of the match.
- `column: number` — 1-based, the start column of the match (ripgrep's match start).

This is the minimal set Accept and Preview need through the existing `PickerContext` (`openTextDocument`, `revealPosition`, `readPreviewContent`, `showPreview`).

### Source — query-driven stream, backend-injected

- The grep source is a **query-driven stream source** (ADR-0003): the query generates the candidates rather than narrowing a pre-existing set, so Narrowing is identity or a light post-filter.
- The source is injected with a `searchWorkspace` primitive — `searchWorkspace(query: string, signal: AbortSignal): SourceSession<GrepCandidate>` — mirroring how the file picker's source is injected with `findFiles` and `readFile`. The primitive is **source-injected at activation**, not added to `PickerContext`, because sourcing is a source concern and `PickerContext` stays scoped to accept/preview.
- **Empty query → empty snapshot, no spawn.** When the query is empty, the source returns an empty candidate collection and never spawns ripgrep. This avoids flooding the picker with every line in the workspace before the user types.
- **Backend:** the injected `searchWorkspace` wraps a spawned ripgrep process. The ripgrep binary path is resolved via the `@vscode/ripgrep` package, and the process is spawned with `rg --json` so matches stream as structured JSON objects. The wrapper parses `rg --json` match objects into `GrepCandidate` batches and yields them through the `SourceSession.updates` channel. Recorded in ADR-0005; it supersedes the last bullet of ADR-0003.
- **Debounce lives in the spawn wrapper, not the host.** The host's query-driven contract is "abort the in-flight source and re-run immediately." Debouncing re-runs is a backend concern (an in-JS source would not need it), so the spawn wrapper debounces before spawning a new `rg` process, preventing a process per keystroke.
- **Excludes:** the source passes the workspace's configured file-excludes (the same `host.fileExcludes` the file picker consumes) to ripgrep as globs, so `node_modules`, `.git`, `dist`, and user-configured excludes are not searched.

### Narrowing — identity / light post-filter against `label`

- Per the query-driven contract (ADR-0003), Narrowing is a light post-filter over the streamed candidates. It matches the query against `label` (the matched line text) and ranks by the shared fuzzy primitive, with no path or field bias baked into the primitive.
- Because candidates arrive already matched to the ripgrep pattern, the post-filter is a refinement of the visible set, not a re-search.

### Render — structured `RowParts`, host owns layout

- `primary` — the matched line text, trimmed of leading indentation for display.
- `secondary` — `${relativePath}:${lineNumber}`, the file-and-line provenance.
- `tooltip` — `absolutePath`, so same-named files across folders are distinguishable on hover.
- No icon in the initial cut (the file picker has none either); the host maps these into its existing DOM slots.

### Accept — open at the match

- Accept calls `context.openTextDocument(absolutePath, { preview: false })` to open the file for real (not as a preview), then `context.revealPosition(absolutePath, { line: lineNumber - 1, character: column - 1 })` to land the cursor on the match column (converting 1-based candidate fields to 0-based editor coordinates).
- The same `absolutePath` string is passed to both calls, so `revealPosition`'s editor lookup by `fsPath` finds the editor that `openTextDocument` just made visible.
- Lifecycle (restoring origin, panel visibility, focus) is owned by the host, identical to the file picker.

### Preview — new host capability: reveal position in the virtual document

- The file picker previews the whole file in the bounded virtual document; grep needs to preview the file **scrolled to the match line**. The host's `showPreview` currently takes `{ text, title, languageId? }` and never reveals a position, so this spec requires a **targeted host change**: `showPreview` gains an optional reveal position — `showPreview({ text, title, languageId?, reveal?: { line: number; character: number } })`. After the host opens/shows the virtual document, it calls `editor.revealRange` at the line so the virtual doc scrolls to the match.
- This is a small, targeted extension to the host's preview path, not a new view or a new document. It keeps reveal logic in the host (where preview/lifecycle ownership already lives) and is the same shape the future document-symbols picker will want.
- Grep's preview uses the existing bounded-content policy (`readPreviewContent`) so large or binary files fall back safely (ADR-0004 holds), and passes the reveal position derived from the candidate's `lineNumber`/`column`.
- Race-safety and teardown-safety are inherited from the host (ticket 09): a stale preview from a replaced/cancelled session cannot reopen or overwrite the virtual document.

### Registration and command — code-only, one command entry

- The grep picker is registered with the host's registry at activation, like the file picker. The single shared webview view serves it via reconfiguration messages; no new view, view-container, or view declaration.
- A new `vsconsult.liveGrep` command is added to `package.json`'s `contributes.commands` and `activationEvents`, invoking `host.start("grep")`. This is the only `package.json` edit the picker requires.
- The picker id is `"grep"`, with user-visible label "Grep", placeholder "Search workspace contents…", and empty state "No matches".

### Dependency — `@vscode/ripgrep`

- `@vscode/ripgrep` is added as a runtime dependency. It provides the path to a prebuilt `rg` binary, stable across platforms. The spawn wrapper imports it to resolve the binary, then spawns `rg --json` with the query as the pattern and the workspace root as the cwd.

## Testing Decisions

### What makes a good test

Tests assert **external behavior**, not implementation details. They drive a module through its public interface with fakes for its collaborators and assert observable outcomes (candidate batches, host outbound messages, editor calls, reveal calls), never internal state or private helpers.

### Modules to be tested and seams

- **Grep picker parts** — `source`, `narrow`, `render`, `accept`, `preview` — each tested at the **picker-part level**, mirroring `src/filePicker/*.test.ts`. Each is a pure function exercised with a fake `PickerContext` (for accept/preview) and a fake `searchWorkspace` primitive (for source). This is the highest seam that covers grep-specific logic and is the established pattern in the repo.
- **Ripgrep spawn wrapper** — the one **new, narrowly-scoped seam**. Tested by feeding the wrapper a fake child process that emits canned `rg --json` lines and asserting the parsed `GrepCandidate` batches stream correctly, abort propagation works, and the empty-query path does not spawn. This is the lowest seam and the only new one; everything else reuses existing seams.
- **Host `showPreview` reveal** — tested at the **existing host seam** (`src/host/host.test.ts`): drive a picker whose preview calls `showPreview` with a `reveal` position and assert the host calls `revealRange` on the shown editor with the right line. Reuses the existing fake-webview-view and fake-source harness.

### Prior art

- `src/filePicker/*.test.ts` — the pattern for picker-part tests (pure functions, fake `PickerContext`).
- `src/fileSourcing.test.ts` — the pattern for injected-workspace sourcing tests, directly analogous to the grep source's injected-`searchWorkspace` tests.
- `src/host/host.test.ts` — the pattern for host-level behavioural tests (fake streaming source, fake webview view, outbound-message assertions), reused for the `showPreview` reveal test.

## Out of Scope

- Document-symbols (imenu) picker and open-buffers picker — the other two navigation-core pickers, to be specced separately.
- Multi-line / context-line display (showing N lines around each match) — Consult shows the single matched line; context comes from the preview.
- Replacement / project-wide edit (rg-based `query-replace`) — this picker is read-only navigation.
- Regex vs literal toggle, case-sensitivity toggle, whole-word toggle — the query is passed to ripgrep as-is; UI toggles for these are deferred.
- Search-in-buffer (searching only the current file) — the grep picker searches the workspace; in-buffer search is a separate concern.
- A ripgrep-binary-not-found fallback (e.g. degrade to in-JS search) — if `@vscode/ripgrep` cannot provide a binary, the source errors and surfaces a status message; a JS fallback is explicitly out of scope (per ADR-0005's rejection of the in-JS search option).
- Sorting matches by relevance vs ripgrep's natural order — matches arrive in ripgrep's order; the post-filter narrows but does not re-rank across files.

## Further Notes

- This is the first picker to exercise the host's query-driven stream support against a real backend. The architecture (ADR-0003, ticket 05) was validated with a fake streaming source; this picker is the proof that it holds for a real one.
- The `showPreview` reveal extension is a host change shared with the future document-symbols picker (which also wants to preview a file scrolled to a symbol). Building it here means document-symbols gets it for free.
- ADR-0005 (grep sources spawn ripgrep via `@vscode/ripgrep`) was written during the design of this picker and records the backend decision; it supersedes the last bullet of ADR-0003.
- No new glossary terms were added to `CONTEXT.md`: grep is a new *picker type* over existing concepts (Source, Stream source, Query-driven source, Candidate, Narrowing), not a new domain concept. The model held without extension.