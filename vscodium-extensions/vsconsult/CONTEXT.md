# vsconsult

vsconsult is a keyboard-first VSCodium picker that provides Consult-like narrowing and preview in a dedicated bottom Panel tab.

## Language

**Picker**:
The complete transient interaction for querying, narrowing, previewing, and accepting a collection of candidates. A picker is a bundle naming five parts: a Source, a Candidate shape, a Narrowing, a Render, and an Accept.
_Avoid_: Selector, search box, palette

**Picker type**:
A concrete configuration of the five picker parts. "File picker" and "grep picker" are picker types; they differ in what they source, how they narrow, what they show, and what accept does.
_Avoid_: Picker kind, picker mode

**Picker registration**:
The code-only act of adding a picker type: a Picker object is registered with the host at activation. Adding a picker requires no `package.json` edit and no republish; the single declared webview view serves any registered picker.
_Avoid_: Picker declaration, manifest entry

**Shared view**:
The single declared webview view that hosts whichever picker was invoked. Its HTML is host-owned and static, generated once at resolve; switching picker type reconfigures the view's content (labels, empty-state text, row parts, candidates) via messages, not by rewriting the webview HTML or declaring a new view.
_Avoid_: Picker view, panel tab

**Source**:
The part of a picker that produces the candidate collection. A source is query-aware: it receives the query and returns either a snapshot or a stream of candidate batches. A file picker's source ignores the query and snapshots the workspace file tree; a live-grep source runs the query as the search pattern and streams matches as they arrive.
_Avoid_: Provider, data source, backend

**Snapshot source**:
A source that delivers its candidates all at once, then completes. The file picker is a snapshot source.
_Avoid_: One-shot source, static source

**Stream source**:
A source that delivers candidates in incremental batches over time, then completes (or continues until cancelled). A live-grep or LSP workspace-symbol source is a stream source. The host appends streamed batches to the visible set and re-narrows or re-renders as they arrive.
_Avoid_: Async source, live source

**Query-driven source**:
A source where the query generates the candidates rather than narrowing a pre-existing set. For a query-driven source the query is input to sourcing, and the picker's Narrowing is identity or a light post-filter, because results arrive already matched. Live grep, live line search, and workspace-symbol search are query-driven.
_Avoid_: Live source, dynamic source

**Source session**:
The object a source returns: an initial batch of candidates (or a promise of one) plus an optional updates channel for streamed batches. A snapshot source returns the collection and no updates; a stream source emits batches through the channel until it completes or the picker exits.
_Avoid_: Source handle, source result

**Candidate**:
A single selectable unit shown by the picker. Every candidate carries the shared contract `id` (a stable handle the host uses to refer to a row) and `label` (the primary display text and the default narrowing text). A picker type extends this with its own fields.
_Avoid_: Item, option, result

**Candidate id**:
A string unique within a picker session, assigned by the source, used by the host and webview protocol to refer to a candidate without inspecting its shape.
_Avoid_: Key, index, identifier

**Candidate label**:
The primary text shown for a candidate and the text narrowing matches against by default. A picker type may narrow against additional fields.
_Avoid_: Name, title, display text

**Narrowing**:
The part of a picker that reduces and ranks the visible candidate set from a query. Each picker supplies its own narrow function, built on a shared fuzzy primitive; the picker decides which candidate field(s) to match and how to rank, so path-aware bias stays a file-picker concern rather than baked into the shared scorer. For a query-driven source, narrowing is identity or a light post-filter, because candidates arrive already matched to the query.
_Avoid_: Matching, searching, filtering

**Fuzzy primitive**:
The shared subsequence-scoring algorithm every picker's narrow function builds on. It scores general text, with no path or field bias. Path-aware bias is added by the file picker, not the primitive.
_Avoid_: Matcher, scorer, fuzzy engine

**Render**:
The part of a picker that projects a candidate into the row fields the host shows. Render returns structured `RowParts` (primary label, optional secondary text, optional icon, optional tooltip); it never produces HTML or touches layout. The host owns the row chrome, the list, keyboard navigation, and theming, so every picker type shares one consistent interaction and look.
_Avoid_: Display, view, formatting

**Row parts**:
The structured projection a picker's Render returns for one candidate: a primary label, an optional secondary text, an optional icon, and an optional tooltip. The host maps these into fixed DOM slots; pickers do not lay out rows.
_Avoid_: Row template, cell model

**Accept**:
The part of a picker that performs the picker type's commit effect on the selected candidate (open a file, jump to a symbol, run a command). Accept receives the candidate and a picker context of host-backed helpers; it performs only the effect and returns. The host owns the surrounding exit: restoring the origin, restoring panel visibility, and returning focus.
_Avoid_: Submit, confirm, open

**Picker context**:
The small set of host-backed helpers handed to a picker's accept and preview actions: opening a text document, revealing a position, executing a command, and reading the origin. Pickers act on candidates through the picker context rather than reaching into the VS Code API directly.
_Avoid_: Services, host API, context object

**Lifecycle**:
The host-owned sequence wrapped around every picker's accept or cancel: restoring the origin editor and selection on cancel, restoring panel visibility, clearing the preview timer, and returning focus. Pickers perform their type-specific effect only; the host runs the lifecycle so it is identical across picker types.
_Avoid_: Session flow, teardown, exit sequence

**Query**:
The text the user types to drive narrowing.
_Avoid_: Search term, filter

**Selection**:
The single highlighted candidate controlled by keyboard navigation.
_Avoid_: Choice, cursor

**Preview**:
A temporary, non-committal display of the selection shown after a short debounce. What a preview shows is defined by the picker type; a file picker previews the file, a symbol picker previews the symbol location.
_Avoid_: Open, commit

**Cancel**:
Exit the picker without accepting and restore the origin.
_Avoid_: Close, dismiss

**Origin**:
The editor, document, and selection active when the picker was invoked, restored on cancellation.
_Avoid_: Previous file, starting tab

**Panel visibility**:
Whether the bottom Panel region was visible before invoking the picker. Exit restores this visibility state but does not promise to reactivate the previously selected Panel tab.
_Avoid_: Panel state, prior panel
