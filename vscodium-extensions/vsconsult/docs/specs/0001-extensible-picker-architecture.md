# Extensible Picker Architecture

## Problem Statement

vsconsult shipped as a feasibility prototype: a single Consult-like workspace-file picker that feels good as a transient, keyboard-first interaction inside VSCodium's bottom Panel. The prototype validated the interaction, but its code is a mess — everything that is "a picker" is welded to "the file picker." The webview, the message protocol, the candidate shape, candidate sourcing, the row rendering, and the accept action all assume files.

As an extension author, I want to add new picker types (live grep, workspace-symbol, buffer, command, imenu) so that vsconsult becomes a family of Consult-like pickers, not a single file picker. Today I cannot do that without forking the webview, the protocol, and the lifecycle, because nothing is parameterized. The architecture needs to grow so that writing a new picker is a bounded, code-only act.

## Solution

Restructure vsconsult around a five-axis Picker abstraction: every picker is a bundle naming a Source, a Candidate shape, a Narrowing, a Render, and an Accept. The host owns the transient interaction chrome (query input, candidate list, keyboard navigation, theming, preview debounce, origin/panel lifecycle) and is picker-agnostic. A single shared webview view serves whichever picker was invoked; adding a picker is a code-only registration with no manifest edit and no republish. Sources are query-aware and deliver either a snapshot or a stream of candidate batches, so both pre-materialized pickers (file) and query-driven streaming pickers (live grep, LSP workspace-symbol) fit one shape.

The file picker — the existing behavior — becomes the first concrete picker assembled from the new parts. No new picker is built by this spec; only the architecture that makes new pickers cheap.

## User Stories

### Architecture / extension authors

1. As an extension author, I want a single Picker abstraction to implement, so that every picker type shares one shape and one set of concepts.
2. As an extension author, I want my picker's five parts (Source, Candidate, Narrowing, Render, Accept) to be independent, so that I can vary any one without rewriting the others.
3. As an extension author, I want to add a picker by registering a Picker object in code, so that I never need to edit package.json or republish the extension to ship a new picker.
4. As an extension author, I want a shared fuzzy primitive to build my Narrowing on, so that I don't reimplement fuzzy subsequence matching.
5. As an extension author, I want my Narrowing to decide which candidate fields to match, so that a grep picker narrows on line text and a file picker narrows on paths.
6. As an extension author, I want my picker to be query-driven (the query generates candidates, not narrows them) without contortion, so that live grep and workspace-symbol search fit the model.
7. As an extension author, I want my source to deliver candidates incrementally as a stream, so that slow or streaming sources populate the list without blocking the UI.
8. As an extension author, I want my Render to return structured row parts (label, secondary text, icon, tooltip) rather than HTML, so that I don't touch DOM, CSS, or CSP.
9. As an extension author, I want my Accept to receive a small host context of helpers (open document, reveal position, execute command, read origin), so that I don't reach into the VS Code API directly and so accept actions stay thin and declarative.
10. As an extension author, I want the host to own exit, origin restore, and panel-visibility restore, so that my picker performs only its commit effect and the lifecycle is identical across pickers.
11. As an extension author, I want the host to own preview debounce and call my preview action, so that rapid navigation doesn't open every traversed candidate.
12. As an extension author, I want my Candidate to carry a stable id and a label plus my own typed fields, so that the host can refer to rows and narrow by default without knowing my candidate's shape.
13. As an extension author, I want the fuzzy primitive to be a swappable interface, so that a native backend can replace the JS scorer later without touching my Narrowing.

### End users (consistency preserved)

14. As a vsconsult user, I want every picker to share the same keyboard navigation, theming, and transient Panel behavior, so that learning one picker transfers to all.
15. As a vsconsult user, I want the file picker's current behavior preserved after restructuring, so that I notice no regression.
16. As a vsconsult user, I want the query to narrow and rank responsively, so that typing feels immediate.
17. As a vsconsult user, I want preview to be debounced, so that rapid arrow navigation doesn't open every candidate.
18. As a vsconsult user, I want Enter to commit the selection and Escape to restore the origin editor and selection, so that cancellation is non-destructive.
19. As a vsconsult user, I want panel visibility restored on exit, so that invoking a picker doesn't permanently change my workbench layout.
20. As a vsconsult user, I want streamed candidates to appear as they arrive, so that a live-grep picker shows matches before the search completes.

### Source / streaming behavior

21. As a picker author, I want a snapshot source to deliver all candidates at once and complete, so that the file picker's "collect the workspace tree" model is supported.
22. As a picker author, I want a stream source to emit candidate batches over time and signal completion, so that live grep and workspace-symbol search are supported.
23. As a picker author, I want the host to cancel an in-flight source when the query changes for a query-driven picker, so that stale search results don't overwrite fresh ones.
24. As a picker author, I want the host to append streamed batches to the visible set and re-narrow (or re-render for query-driven pickers), so that incremental arrival is handled correctly.
25. As a picker author, I want my query-driven picker's Narrowing to be identity or a light post-filter, so that I'm not forced to narrow results that arrived already matched.

### Registration / invocation

26. As an extension author, I want one shared webview view to host whichever picker was invoked, so that the manifest stays small regardless of picker count.
27. As an extension author, I want invoking a picker to reconfigure the shared view's content via messages (labels, empty-state text, row parts, candidates), so that switching picker type doesn't require a new view or rewritten webview HTML.
28. As an extension author, I want the webview HTML to be host-owned and generated once, so that pickers never ship HTML and CSP/theming stay centralized.
29. As an extension author, I want a command to invoke a picker by id, so that each picker can have a Command Palette entry without a dedicated view.

## Implementation Decisions

### The Picker abstraction

A Picker is a bundle naming five parts: Source, Candidate shape, Narrowing, Render, Accept. "Picker type" is a concrete configuration of these five. This is the root decision; everything else hangs off it. (CONTEXT.md: Picker, Picker type.)

### Candidate contract

Every Candidate carries the shared contract `id` (a stable handle the host and webview protocol use to refer to a row) and `label` (the primary display text and default narrowing text). Each picker type extends this with strongly-typed fields. The host only ever needs `id` and `label`; pickers consume their own extras. The existing file Candidate becomes `FileCandidate extends Candidate` with `directory` and `relativePath`. (CONTEXT.md: Candidate, Candidate id, Candidate label.)

### Narrowing layers (three)

1. A shared fuzzy primitive — an interface `FuzzyScorer: score(query, text) → number | undefined` plus a `rank(query, items, textOf)` helper — scoring general text with no path or field bias.
2. A per-picker Narrowing function built on the primitive; the picker decides which candidate field(s) to match and how to rank. Path-aware bias (boundary chars, filename-end weighting currently in `scorePath`) moves into the file picker's narrow function, not the primitive.
3. File-picker-specific path bias on top of the primitive.

For query-driven pickers, Narrowing is identity or a light post-filter, because candidates arrive already matched to the query. The fuzzy primitive is a swappable interface so a native backend can replace the JS implementation later without touching Narrowing functions. (ADR-0001: fuzzy primitive interface; CONTEXT.md: Narrowing, Fuzzy primitive.)

### Rendering

The host owns all webview chrome: query input, status line, scrollable list, keyboard navigation, selection styling, empty state, CSP, theming. Each picker supplies a `renderCandidate(candidate) → RowParts { primary, secondary?, icon?, tooltip? }`. Pickers never produce HTML or touch layout. The host maps RowParts into fixed DOM slots. The escape hatch for a layout the fixed slots cannot express is to extend RowParts (an additive host change shared by all pickers), not per-picker HTML. (CONTEXT.md: Render, Row parts.)

### Accept and lifecycle

`accept(candidate, PickerContext)` performs only the picker-type commit effect (open file, jump to symbol, run command) and returns. PickerContext exposes host-backed helpers: opening a text document, revealing a position, executing a command, and reading the origin (illustrative set; exact surface finalized at implementation time). The host owns the surrounding lifecycle — exit, restoring the origin editor and selection on cancel, restoring panel visibility, clearing the preview timer, returning focus — identical across pickers. Preview follows the same split: `preview(candidate, ctx)` is per-picker; the debounce and timer are host-owned. (CONTEXT.md: Accept, Picker context, Lifecycle, Preview, Cancel, Origin, Panel visibility.)

### Sources: query-aware, snapshot-or-stream

A Source is query-aware: it receives the query and returns a Source session — an initial batch of candidates (or a promise of one) plus an optional updates channel for streamed batches. Snapshot sources (file picker) ignore the query, deliver all candidates at once, and never emit updates. Stream sources (live grep, LSP workspace-symbol) run the query as the search pattern and emit match batches as they arrive. Query-driven sources use identity Narrowing because results arrive already matched. The host cancels an in-flight source when the query changes for a query-driven picker, and appends streamed batches to the visible set, re-narrowing (pre-materialized) or re-rendering (query-driven). (ADR-0003; CONTEXT.md: Source, Snapshot source, Stream source, Query-driven source, Source session.)

### Registration and the shared view

One shared webview view, host-owned static HTML generated once at resolve, serves whichever picker was invoked. Switching picker type reconfigures the view's content (labels, empty-state text, row parts, candidates) via postMessage, not by rewriting the webview HTML or declaring a new view. Adding a picker is code-only: register a Picker object at activation; no package.json edit, no new declared view, no republish. Only one picker is active at a time. (ADR-0002; CONTEXT.md: Picker registration, Shared view.)

### Modules to be built/modified

- **Picker core** — the Picker interface (five-axis bundle), Candidate and RowParts types, PickerContext. Pure types; no vscode coupling.
- **Fuzzy primitive** — the FuzzyScorer interface plus the JS implementation refactored out of the existing `matcher.ts` (its subsequence core becomes the primitive; its path bias moves to the file picker). A `rank` helper built on the primitive.
- **Source** — the Source interface, SourceSession type, snapshot and stream shapes.
- **Host** — the shared webview view provider, session state, generalized message protocol, lifecycle (exit/origin/panel restore), preview debounce, picker invocation and re-configuration of the shared view. This is the thin VS Code glue that replaces the current monolithic `extension.ts` provider.
- **Registry** — the picker registration API used at activation.
- **File picker** — the existing file-picker behavior reassembled from the new parts: a file Source (workspace file tree, .gitignore/.gitmodules merging, baseline excludes), a path-biased Narrowing on the fuzzy primitive, a Render projecting FileCandidate to RowParts, an Accept that opens the selected file via PickerContext, and a Preview that opens it in preview mode. This is the first concrete Picker and the vehicle that preserves current behavior.
- **Extension entrypoint** — `activate` registers the file picker (and future pickers) with the host and wires the host to the shared view.
- The existing `gitmodules.ts` pure parser is retained and reused by the file Source. The existing `matcher.ts` is refactored into the fuzzy primitive plus the file picker's narrow.

### Candidate cap

The prototype's 2,000-candidate cap has already been removed from the code (the file source calls `findFiles` with no `maxResults`). The cap was a prototype-scope limit, not a permanent constraint, and is not reintroduced.

## Testing Decisions

### What makes a good test

Tests assert external behavior at public boundaries, not implementation details. A good test drives a Picker through its five parts as a black box and asserts the visible candidates it produces, the row parts it renders, and the effect of accepting a candidate — without instantiating vscode, the webview, or the host.

### The seam

One primary seam: the Picker, driven through its five parts (Source + Narrowing → visible candidates; Render → row parts; Accept → effect against a recording/fake PickerContext). The host (webview provider, session, lifecycle, message protocol) is intentionally thin VS Code glue and is not the subject of tests; it is wiring.

To make the Source drivable without a vscode host, the Source takes **injectable workspace dependencies** (an interface for "find files" / "read file") rather than calling `vscode.*` directly. Tests pass a fake workspace; production wires the real vscode APIs. This is the one new seam the architecture introduces, placed at the highest practical point (the Source boundary).

### Modules to be tested

- **Fuzzy primitive** — `score` and `rank` over general text, no path bias. Direct successor of the existing `matcher.test.ts` style.
- **File picker Narrowing** — path-biased ranking built on the primitive; assert boundary/filename-end weighting and tie-breaking.
- **File picker Render** — FileCandidate → RowParts projection (name primary, directory secondary).
- **File picker Source** — given a fake workspace (injected find-files + .gitignore/.gitmodules contents), asserts the produced candidate collection, exclude merging, and submodule exclusion. Reuses the existing `gitmodules.test.ts` parser coverage.
- **File picker Accept** — given a fake PickerContext, asserts the open-document effect and that lifecycle is delegated to the host (not performed by Accept).
- **Stream/Source session** — a snapshot source returns its collection and no updates; a stream source emits batches then completes; the host-side append/re-narrow behavior is asserted at the Source-session boundary.

### Prior art

The existing `matcher.test.ts` and `gitmodules.test.ts` already test pure functions at their public boundary with zero vscode coupling. The new architecture generalizes that same style across all picker parts. The vitest runner and esbuild build are unchanged.

## Out of Scope

- Building any new picker other than reassembling the existing file picker into the new shape (no live grep, no workspace-symbol, no buffer/command/imenu picker in this spec).
- A native fuzzy backend (fff or otherwise). The fuzzy primitive is a swappable interface; the JS implementation ships. Native substitution is a documented future option, not delivered here.
- A side-by-side preview pane, rich file metadata/badges, syntax-highlighted excerpts, or persistent recency/ranking history.
- Large-workspace indexing beyond the in-memory candidate set (the cap is removed, but no indexing engine is introduced).
- Configurable layouts or keybindings.
- Publishing to Open VSX.
- Resolving concurrent invocation semantics (a second invocation while one picker is active). Provisional behavior: the active picker is replaced. This is to be resolved in a later session and is not locked in by this spec.
- Finalizing the exact PickerContext surface (the illustrative set is open document, reveal position, execute command, read origin).
- Deciding whether narrowing may run client-side in the webview; the default is host-side and the architecture does not forbid webview-side later, but no webview-side narrowing is delivered here.

## Further Notes

- Domain language is captured in `CONTEXT.md` (Picker, Picker type, Source, Candidate, Candidate id, Candidate label, Narrowing, Fuzzy primitive, Render, Row parts, Accept, Picker context, Lifecycle, Query, Selection, Preview, Cancel, Origin, Panel visibility, Snapshot source, Stream source, Query-driven source, Source session, Picker registration, Shared view).
- Architectural decisions are recorded in `docs/adr/`: 0001 fuzzy primitive interface, 0002 one shared picker view, 0003 source query-aware snapshot-or-stream.
- The prototype doc `docs/prototype.md` was removed; its concepts are preserved as precise terms in `CONTEXT.md`, and its concrete UX specifics (Up/Down + Ctrl+P/Ctrl+N, ~125 ms preview debounce, Enter/Escape) belong in the file picker's implementation, not a lingering half-correct artifact.
- This spec covers architecture only; a follow-up spec will structure the file picker's exact behavior into the new shape and may add further pickers.